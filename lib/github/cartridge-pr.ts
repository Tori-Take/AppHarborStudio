/**
 * Web Studio → AppHarbor 本体に「カートリッジ install PR」を作成する。
 *
 * 動作:
 *   1. ソースリポ (例: Tori-Take/vehicle-equipment) の全ファイルを GitHub API で取得
 *   2. ターゲットリポ (例: Tori-Take/appharbor) に新ブランチ作成
 *   3. ブランチに以下をコミット:
 *      - cartridges/{cartridgeId}/* (全ファイル)
 *      - supabase/migrations/{timestamp}_cart_{cartridgeId}_v{version}.sql
 *   4. PR 作成 → URL を返す
 *
 * Octokit を使わず raw fetch のみで実装 (依存最小化)。
 */

import { updateRegistryRef } from './registry-yaml'

const GH_API = 'https://api.github.com'

type TreeEntry = {
  path: string
  mode: '100644' | '100755' | '040000' | '160000' | '120000'
  type: 'blob' | 'tree' | 'commit'
  sha?: string
  content?: string
}

type SourceFile = {
  /** リポ内の path (例: routes/page.tsx) */
  path: string
  /** ファイル中身 (UTF-8) */
  content: string
}

export type InstallPrOptions = {
  /** ソース: "owner/repo" (例: "Tori-Take/vehicle-equipment") */
  cartridgeRepo: string
  /** ソース branch (デフォルト: main) */
  cartridgeRef?: string
  /** ターゲット: "owner/repo" (例: "Tori-Take/appharbor") */
  targetRepo: string
  /** ターゲット base branch (デフォルト: main) */
  targetBase?: string
  /** カートリッジ ID (path 用: cartridges/{cartridgeId}/) */
  cartridgeId: string
  /** カートリッジの semantic version (manifest.json から、PR タイトル等の表示用) */
  version: string
  /** Migration ファイル名の連番 (v1, v2, ...)。1 始まり */
  schemaVersion: number
  /** 本番用 migration SQL */
  migrationSql: string
  /**
   * installMode:
   *   - initial: 初回投入。registry 追加 + (registry がなければ) ファイルコピー
   *   - update:  改修。registry は触らず、新 migration ファイルだけ追加
   */
  installMode: 'initial' | 'update'
  /** bumpRef モード: タグ作成 + registry の ref bump のみ (migration は changeKind 次第) */
  bumpRef?: boolean
  /** bumpRef 時の新タグ名 (外部で決定済み) */
  newTag?: string
  /** bumpRef 時: migration SQL を含めるか (changeKind=schema の場合のみ true) */
  includeMigration?: boolean
}

export type InstallMode = 'files' | 'registry' | 'migration-only' | 'ref-bump'

export type InstallPrResult = {
  prUrl:    string
  prNumber: number
  branch:   string
  filesAdded: number
  mode:    InstallMode
  schemaVersion: number
}

async function gh<T = unknown>(
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  endpoint: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${GH_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'AppHarborStudio',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub API ${method} ${endpoint} failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`)
  }
  return res.json() as Promise<T>
}

/** ソースリポの全ファイル一覧 (path + blob sha) を取得 */
async function listSourceTree(
  token: string,
  repo: string,
  ref: string,
): Promise<Array<{ path: string; sha: string; size?: number }>> {
  // 1. ref の commit SHA を取得
  const refData = await gh<{ object: { sha: string } }>(
    token, 'GET', `/repos/${repo}/git/ref/heads/${ref}`,
  )
  const commitSha = refData.object.sha
  // 2. commit から tree SHA を取得
  const commit = await gh<{ tree: { sha: string } }>(
    token, 'GET', `/repos/${repo}/git/commits/${commitSha}`,
  )
  const treeSha = commit.tree.sha
  // 3. tree を再帰取得
  const tree = await gh<{ tree: Array<{ path: string; type: string; sha: string; size?: number }>; truncated: boolean }>(
    token, 'GET', `/repos/${repo}/git/trees/${treeSha}?recursive=1`,
  )
  if (tree.truncated) {
    throw new Error(`ソースリポのファイル数が多すぎる (truncated): ${repo}`)
  }
  return tree.tree.filter(e => e.type === 'blob').map(e => ({ path: e.path, sha: e.sha, size: e.size }))
}

/** blob の中身 (base64 → UTF-8) を取得 */
async function getBlobContent(
  token: string,
  repo: string,
  sha: string,
): Promise<string> {
  const blob = await gh<{ content: string; encoding: string }>(
    token, 'GET', `/repos/${repo}/git/blobs/${sha}`,
  )
  if (blob.encoding === 'base64') {
    return Buffer.from(blob.content, 'base64').toString('utf-8')
  }
  return blob.content
}

/** ターゲットリポに blob を作成して SHA を返す */
async function createBlob(
  token: string,
  repo: string,
  content: string,
): Promise<string> {
  const res = await gh<{ sha: string }>(
    token, 'POST', `/repos/${repo}/git/blobs`,
    { content: Buffer.from(content, 'utf-8').toString('base64'), encoding: 'base64' },
  )
  return res.sha
}

/** ターゲットリポに cartridges-registry.yaml があるか確認 */
async function targetHasRegistry(token: string, repo: string, ref: string): Promise<boolean> {
  try {
    await gh(token, 'GET', `/repos/${repo}/contents/cartridges-registry.yaml?ref=${ref}`)
    return true
  } catch {
    return false
  }
}

/** ターゲットリポの registry に指定 cartridge ID が登録されているか確認 */
export async function targetRegistryHasCartridge(
  token: string,
  repo: string,
  ref: string,
  cartridgeId: string,
): Promise<boolean> {
  try {
    const cur = await gh<{ content: string; encoding: string }>(
      token, 'GET', `/repos/${repo}/contents/cartridges-registry.yaml?ref=${ref}`,
    )
    const yaml = Buffer.from(cur.content, 'base64').toString('utf-8')
    const escapedId = cartridgeId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const re = new RegExp(`^\\s+-\\s+id:\\s*${escapedId}\\s*$`, 'm')
    return re.test(yaml)
  } catch {
    return false
  }
}

/**
 * ターゲットリポの supabase/migrations/ ディレクトリから
 * 指定 cartridge の migration ファイル名一覧を取得する。
 *
 * 使い方: determineNextVersion() に渡して次の v 番号を採番。
 */
export async function listExistingCartridgeMigrations(
  token: string,
  repo: string,
  ref: string,
  cartridgeId: string,
): Promise<string[]> {
  try {
    const list = await gh<Array<{ name: string; type: string }>>(
      token, 'GET', `/repos/${repo}/contents/supabase/migrations?ref=${ref}`,
    )
    const cartridgeIdSafe = cartridgeId.replace(/-/g, '_')
    const re = new RegExp(`_cart_${cartridgeIdSafe}_v\\d+\\.sql$`, 'i')
    return list
      .filter(f => f.type === 'file' && re.test(f.name))
      .map(f => f.name)
  } catch {
    return []
  }
}

/** registry に新エントリ 1 行を追加した文字列を返す */
function appendRegistryEntry(yaml: string, cartridgeId: string, cartridgeRepo: string, ref: string): string {
  // 既にエントリがあるなら何もしない
  const existsRe = new RegExp(`^\\s+-\\s+id:\\s*${cartridgeId.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\s*$`, 'm')
  if (existsRe.test(yaml)) return yaml
  const block = `\n  - id: ${cartridgeId}\n    repo: ${cartridgeRepo}\n    ref: ${ref}\n    mode: installed\n    enabled: true\n`
  return yaml.trimEnd() + '\n' + block
}

export async function createCartridgeInstallPr(
  token: string,
  opts: InstallPrOptions,
): Promise<InstallPrResult> {
  const sourceRef = opts.cartridgeRef ?? 'main'
  const targetBase = opts.targetBase ?? 'main'
  const isUpdate = opts.installMode === 'update'

  // mode 決定
  // - ref-bump: registry の ref を新タグへ bump (固定タグ運用)
  // - update:   migration-only (registry や files には触らない)
  // - initial:  registry があれば registry モード、なければ files モード (legacy)
  let mode: InstallMode
  if (opts.bumpRef) {
    mode = 'ref-bump'
  } else if (isUpdate) {
    mode = 'migration-only'
  } else {
    const useRegistry = await targetHasRegistry(token, opts.targetRepo, targetBase)
    mode = useRegistry ? 'registry' : 'files'
  }

  const treeEntries: TreeEntry[] = []
  let filesProcessed = 0

  if (mode === 'ref-bump') {
    // === ref-bump モード: registry の ref を新タグへ bump ===
    const cur = await gh<{ content: string; encoding: string; sha: string }>(
      token, 'GET', `/repos/${opts.targetRepo}/contents/cartridges-registry.yaml?ref=${targetBase}`,
    )
    const currentYaml = Buffer.from(cur.content, 'base64').toString('utf-8')
    const newYaml = updateRegistryRef(currentYaml, opts.cartridgeId, opts.newTag!)
    const newSha = await createBlob(token, opts.targetRepo, newYaml)
    treeEntries.push({
      path: 'cartridges-registry.yaml',
      mode: '100644',
      type: 'blob',
      sha: newSha,
    })
    filesProcessed = 1
  } else if (mode === 'registry') {
    // === registry モード (initial): registry に 1 行追加するだけ ===
    const cur = await gh<{ content: string; encoding: string; sha: string }>(
      token, 'GET', `/repos/${opts.targetRepo}/contents/cartridges-registry.yaml?ref=${targetBase}`,
    )
    const currentYaml = Buffer.from(cur.content, 'base64').toString('utf-8')
    const newYaml = appendRegistryEntry(currentYaml, opts.cartridgeId, opts.cartridgeRepo, sourceRef)
    if (newYaml === currentYaml) {
      throw new Error(
        `既に registry に ${opts.cartridgeId} が登録されています。` +
        `改修の場合は installMode: 'update' で呼び出してください。`,
      )
    }
    const newSha = await createBlob(token, opts.targetRepo, newYaml)
    treeEntries.push({
      path: 'cartridges-registry.yaml',
      mode: '100644',
      type: 'blob',
      sha:  newSha,
    })
    filesProcessed = 1
  } else if (mode === 'files') {
    // === files モード (initial, legacy): 全ファイルをコピー ===
    const sourceFiles = await listSourceTree(token, opts.cartridgeRepo, sourceRef)
    if (sourceFiles.length === 0) {
      throw new Error(`ソースリポにファイルがありません: ${opts.cartridgeRepo}`)
    }
    const additionalFiles: SourceFile[] = []
    for (const f of sourceFiles) {
      if (f.path.startsWith('.github/')) continue
      if (f.path.startsWith('.git/')) continue
      const content = await getBlobContent(token, opts.cartridgeRepo, f.sha)
      additionalFiles.push({ path: f.path, content })
    }
    for (const f of additionalFiles) {
      const blobSha = await createBlob(token, opts.targetRepo, f.content)
      treeEntries.push({
        path: `cartridges/${opts.cartridgeId}/${f.path}`,
        mode: '100644',
        type: 'blob',
        sha:  blobSha,
      })
    }
    filesProcessed = additionalFiles.length
  }
  // mode === 'migration-only': registry や files には何も追加しない (下で migration だけ追加される)

  // 4. Migration SQL を tree に追加 (ref-bump で includeMigration=false なら skip)
  const ts = new Date().toISOString().replace(/[-T:.]/g, '').slice(0, 14)
  const migrationFilename = `${ts}_cart_${opts.cartridgeId.replace(/-/g, '_')}_v${opts.schemaVersion}.sql`
  const includeMigrationFile = mode !== 'ref-bump' || opts.includeMigration === true
  if (includeMigrationFile) {
    const migrationBlobSha = await createBlob(token, opts.targetRepo, opts.migrationSql)
    treeEntries.push({
      path: `supabase/migrations/${migrationFilename}`,
      mode: '100644',
      type: 'blob',
      sha:  migrationBlobSha,
    })
  }

  // 5. base branch の commit / tree SHA を取得
  const baseRef = await gh<{ object: { sha: string } }>(
    token, 'GET', `/repos/${opts.targetRepo}/git/ref/heads/${targetBase}`,
  )
  const baseCommitSha = baseRef.object.sha
  const baseCommit = await gh<{ tree: { sha: string } }>(
    token, 'GET', `/repos/${opts.targetRepo}/git/commits/${baseCommitSha}`,
  )
  const baseTreeSha = baseCommit.tree.sha

  // 6. base tree に上記 entries を重ねた新 tree を作成
  const newTree = await gh<{ sha: string }>(
    token, 'POST', `/repos/${opts.targetRepo}/git/trees`,
    { base_tree: baseTreeSha, tree: treeEntries },
  )

  // 7. commit 作成
  const isBump = mode === 'ref-bump'
  const verbForCommit = isBump ? 'bump' : isUpdate ? 'update' : 'install'
  const schemaSuffix = includeMigrationFile ? ` (schema v${opts.schemaVersion})` : ''
  const commitBumpLine = isBump ? `\nRegistry ref → ${opts.newTag}` : ''
  const commitMigrationLine = includeMigrationFile ? `\nMigration: ${migrationFilename}` : ''
  const commitMessage = `feat(cartridges): ${verbForCommit} ${opts.cartridgeId} v${opts.version}${schemaSuffix}\n\nAuto-generated by AppHarbor Studio.\nSource: https://github.com/${opts.cartridgeRepo}${commitBumpLine}${commitMigrationLine}`
  const newCommit = await gh<{ sha: string }>(
    token, 'POST', `/repos/${opts.targetRepo}/git/commits`,
    { message: commitMessage, tree: newTree.sha, parents: [baseCommitSha] },
  )

  // 8. ブランチ作成 (push)
  const branchPrefix = isBump ? 'cart-bump' : isUpdate ? 'cart-update' : 'cart-install'
  const branchName = `${branchPrefix}/${opts.cartridgeId}-v${opts.schemaVersion}-${ts}`
  await gh(
    token, 'POST', `/repos/${opts.targetRepo}/git/refs`,
    { ref: `refs/heads/${branchName}`, sha: newCommit.sha },
  )

  // 9. PR 作成
  const modeNote =
    isBump
      ? `**ref bump モード**: \`cartridges-registry.yaml\` の \`${opts.cartridgeId}\` を \`ref: ${opts.newTag}\` に更新。` +
        (includeMigrationFile
          ? `\nスキーマ migration (\`${migrationFilename}\`) を同梱。`
          : `\nmigration なし (コード変更のみ)。`) +
        `\nマージ後の Vercel ビルドで新タグからカートリッジを自動取得します。`
      : mode === 'registry'
        ? `\`cartridges-registry.yaml\` に 1 行追加するだけの軽量 PR (registry モード)。\nVercel ビルド時に \`scripts/fetch-cartridges.js\` が GitHub から自動 clone する。`
        : mode === 'files'
          ? `\`cartridges/${opts.cartridgeId}/\` 配下のファイルを直接コピー (files モード)。\nターゲットリポに \`cartridges-registry.yaml\` がないため legacy モードで動作。`
          : `**update モード**: 既存カートリッジへのスキーマ更新。\nregistry は変更せず、新 migration SQL ファイル 1 つだけを追加します。\nカートリッジコード (routes/) は \`fetch-cartridges\` が GitHub から最新を自動取得します。`

  const titleVerb = isBump ? 'Bump cartridge ref' : isUpdate ? 'Update cartridge schema' : 'Install cartridge'

  let prBody: string
  if (isBump) {
    const bumpLines = [
      `**カートリッジ ref bump (自動生成 PR)**`,
      '',
      `- カートリッジ: \`${opts.cartridgeId}\` v${opts.version}`,
      `- ソース: https://github.com/${opts.cartridgeRepo} (\`${opts.newTag}\`)`,
      `- registry ref → \`${opts.newTag}\``,
      includeMigrationFile
        ? `- Migration: \`${migrationFilename}\` (schema v${opts.schemaVersion})`
        : `- Migration: なし (コード変更のみ)`,
      '',
      modeNote,
      '',
      `### マージ後の手順`,
      '',
      `1. Vercel が自動で再ビルド → fetch-cartridges が \`${opts.newTag}\` から clone → sync-cartridges が app/ にマウント`,
    ]
    if (includeMigrationFile) {
      bumpLines.push(
        `2. **本番 Supabase に migration 適用**:`,
        `   \`\`\`bash`,
        `   cd /path/to/appharbor`,
        `   git pull`,
        `   npx supabase db push --linked`,
        `   \`\`\``,
      )
    }
    bumpLines.push('', `🤖 Generated by AppHarbor Studio`)
    prBody = bumpLines.filter(line => line !== '').join('\n')
  } else {
    prBody = [
      `**${isUpdate ? 'カートリッジスキーマ更新' : 'カートリッジ install'} (自動生成 PR)**`,
      '',
      `- カートリッジ: \`${opts.cartridgeId}\` v${opts.version}`,
      `- ソース: https://github.com/${opts.cartridgeRepo} (\`${sourceRef}\`)`,
      `- モード: **${mode}** (${filesProcessed} ファイル + migration 1)`,
      `- Migration: \`${migrationFilename}\` (schema v${opts.schemaVersion})`,
      '',
      modeNote,
      '',
      `### マージ後の手順`,
      '',
      isUpdate
        ? `1. **本番 Supabase に migration 適用**:`
        : `1. Vercel が自動で再ビルド ${mode === 'registry' ? '→ fetch-cartridges が GitHub から clone → sync-cartridges が app/ にマウント' : `→ カートリッジが \`cartridges/${opts.cartridgeId}/\` に展開される`}`,
      isUpdate ? '' : `2. **本番 Supabase に migration 適用** (まだ自動化されてない):`,
      `   \`\`\`bash`,
      `   cd /path/to/appharbor`,
      `   git pull`,
      `   npx supabase db push --linked`,
      `   \`\`\``,
      isUpdate
        ? `2. **カートリッジリポに \`db/schema.released.sql\` をコミット**:`
        : `3. AppHarbor 管理画面で「インストール可能アプリ」に出現 → install ボタン → 組織で有効化`,
      isUpdate
        ? `   Studio が生成した snapshot を \`${opts.cartridgeRepo}\` の \`db/schema.released.sql\` として`
        : '',
      isUpdate
        ? `   コミット & push。これが次回の改修時の diff 基準になります。`
        : '',
      '',
      `🤖 Generated by AppHarbor Studio`,
    ].filter(line => line !== '').join('\n')
  }

  const pr = await gh<{ html_url: string; number: number }>(
    token, 'POST', `/repos/${opts.targetRepo}/pulls`,
    {
      title: `${titleVerb}: ${opts.cartridgeId} v${opts.version} (schema v${opts.schemaVersion})`,
      head:  branchName,
      base:  targetBase,
      body:  prBody,
    },
  )

  return {
    prUrl:      pr.html_url,
    prNumber:   pr.number,
    branch:     branchName,
    filesAdded: treeEntries.length,
    mode,
    schemaVersion: opts.schemaVersion,
  }
}
