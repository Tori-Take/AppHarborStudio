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
  /** バージョン (manifest.json から) */
  version: string
  /** 本番用 migration SQL */
  migrationSql: string
}

export type InstallPrResult = {
  prUrl:    string
  prNumber: number
  branch:   string
  filesAdded: number
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

export async function createCartridgeInstallPr(
  token: string,
  opts: InstallPrOptions,
): Promise<InstallPrResult> {
  const sourceRef = opts.cartridgeRef ?? 'main'
  const targetBase = opts.targetBase ?? 'main'

  // 1. ソースリポの全ファイルを列挙
  const sourceFiles = await listSourceTree(token, opts.cartridgeRepo, sourceRef)
  if (sourceFiles.length === 0) {
    throw new Error(`ソースリポにファイルがありません: ${opts.cartridgeRepo}`)
  }

  // 2. 各ファイルを取得 → ターゲットに blob 作成
  const additionalFiles: SourceFile[] = []
  for (const f of sourceFiles) {
    // .git や .github 等の特殊フォルダはスキップ (.github ワークフローは持ち込まない)
    if (f.path.startsWith('.github/')) continue
    if (f.path.startsWith('.git/')) continue
    const content = await getBlobContent(token, opts.cartridgeRepo, f.sha)
    additionalFiles.push({ path: f.path, content })
  }

  // 3. ターゲットリポに blob を作成 (バッチ並列)
  const treeEntries: TreeEntry[] = []
  for (const f of additionalFiles) {
    const blobSha = await createBlob(token, opts.targetRepo, f.content)
    treeEntries.push({
      path: `cartridges/${opts.cartridgeId}/${f.path}`,
      mode: '100644',
      type: 'blob',
      sha:  blobSha,
    })
  }

  // 4. Migration SQL を tree に追加
  const ts = new Date().toISOString().replace(/[-T:.]/g, '').slice(0, 14)
  const migrationFilename = `${ts}_cart_${opts.cartridgeId.replace(/-/g, '_')}_v${opts.version.replace(/\./g, '_')}.sql`
  const migrationBlobSha = await createBlob(token, opts.targetRepo, opts.migrationSql)
  treeEntries.push({
    path: `supabase/migrations/${migrationFilename}`,
    mode: '100644',
    type: 'blob',
    sha:  migrationBlobSha,
  })

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
  const commitMessage = `feat(cartridges): install ${opts.cartridgeId} v${opts.version}\n\nAuto-generated by AppHarbor Studio.\nSource: https://github.com/${opts.cartridgeRepo}\nMigration: ${migrationFilename}`
  const newCommit = await gh<{ sha: string }>(
    token, 'POST', `/repos/${opts.targetRepo}/git/commits`,
    { message: commitMessage, tree: newTree.sha, parents: [baseCommitSha] },
  )

  // 8. ブランチ作成 (push)
  const branchName = `cart-install/${opts.cartridgeId}-v${opts.version}-${ts}`
  await gh(
    token, 'POST', `/repos/${opts.targetRepo}/git/refs`,
    { ref: `refs/heads/${branchName}`, sha: newCommit.sha },
  )

  // 9. PR 作成
  const prBody = [
    `**カートリッジ install (自動生成 PR)**`,
    '',
    `- カートリッジ: \`${opts.cartridgeId}\` v${opts.version}`,
    `- ソース: https://github.com/${opts.cartridgeRepo} (\`${sourceRef}\`)`,
    `- 追加ファイル数: ${treeEntries.length} (うち migration 1)`,
    '',
    `### マージ後の手順`,
    '',
    `1. Vercel が自動で再ビルド → カートリッジが \`cartridges/${opts.cartridgeId}/\` に展開される`,
    `2. **本番 Supabase に migration 適用** (まだ自動化されてない):`,
    `   \`\`\`bash`,
    `   cd /path/to/appharbor`,
    `   git pull`,
    `   npx supabase db push --linked`,
    `   \`\`\``,
    `3. AppHarbor 管理画面で「インストール可能アプリ」に出現 → install ボタン → 組織で有効化`,
    '',
    `🤖 Generated by AppHarbor Studio`,
  ].join('\n')

  const pr = await gh<{ html_url: string; number: number }>(
    token, 'POST', `/repos/${opts.targetRepo}/pulls`,
    {
      title: `Install cartridge: ${opts.cartridgeId} v${opts.version}`,
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
  }
}
