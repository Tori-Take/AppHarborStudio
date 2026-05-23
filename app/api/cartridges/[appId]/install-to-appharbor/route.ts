import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'
import {
  createCartridgeInstallPr,
  listExistingCartridgeMigrations,
  targetRegistryHasCartridge,
} from '@/lib/github/cartridge-pr'
import {
  parseSchema,
  diffSchemas,
  findDestructiveWarnings,
  generateAlterSql,
  determineNextVersion,
} from '@/lib/schema-diff'

/**
 * Web Studio → AppHarbor 本番リポに「カートリッジ install / update PR」を作成する。
 *
 * モード判定:
 *   - initial: カートリッジリポに db/schema.released.sql がない、または AppHarbor の registry に未登録
 *              → CREATE TABLE migration + registry 追加 (or files copy)
 *   - update:  カートリッジリポに db/schema.released.sql がある & registry に登録済み
 *              → schema.released.sql vs schema.sql の diff から ALTER migration を生成
 *                registry は触らず migration ファイルだけ追加
 *
 * 必要な環境変数:
 *   GITHUB_TOKEN              : write 権限あり (repo スコープの classic PAT)
 *   APPHARBOR_TARGET_REPO     : "owner/repo" (デフォルト: "Tori-Take/appharbor")
 *   APPHARBOR_TARGET_BRANCH   : ベースブランチ (デフォルト: "main")
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'GITHUB_TOKEN が未設定です。Vercel の Environment Variables に repo スコープ付きの classic PAT を設定してください。' },
      { status: 400 },
    )
  }

  const targetRepo   = process.env.APPHARBOR_TARGET_REPO   ?? 'Tori-Take/appharbor'
  const targetBranch = process.env.APPHARBOR_TARGET_BRANCH ?? 'main'

  // カートリッジ情報取得
  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json({ ok: false, error: `cartridge ${safe} not found` }, { status: 404 })
  }

  const version = (entry.manifest?.version as string | undefined) ?? '0.1.0'

  // ソースリポを registry から特定
  const cartridgeRepo = findCartridgeRepo(safe)
  if (!cartridgeRepo) {
    return NextResponse.json(
      { ok: false, error: `Studio の registry に installed エントリ + repo フィールドが必要です: ${safe}` },
      { status: 400 },
    )
  }

  // schema.sql の有無確認
  const schemaPath = join(entry.path, 'db', 'schema.sql')
  if (!existsSync(schemaPath)) {
    return NextResponse.json(
      { ok: false, error: `db/schema.sql が見つかりません: ${schemaPath}` },
      { status: 400 },
    )
  }
  const schemaSql = readFileSync(schemaPath, 'utf-8')

  // --- モード判定 ---
  const schemaReleasedPath = join(entry.path, 'db', 'schema.released.sql')
  const hasReleasedSnapshot = existsSync(schemaReleasedPath)
  const alreadyRegistered = await targetRegistryHasCartridge(token, targetRepo, targetBranch, safe)

  // 更新モードの条件: snapshot がある & 既に registry 登録済み
  // (snapshot だけあって未登録のケースは「初回投入をやり直し」とみなす)
  const installMode: 'initial' | 'update' = hasReleasedSnapshot && alreadyRegistered ? 'update' : 'initial'

  let migrationSql = ''
  let schemaVersion = 1
  let mode_warnings: ReturnType<typeof findDestructiveWarnings> = []
  let manualChangesNeeded: ReturnType<typeof generateAlterSql>['manualChangesNeeded'] = []

  if (installMode === 'update') {
    // === 更新モード: diff ベース ALTER 生成 ===
    const releasedSql = readFileSync(schemaReleasedPath, 'utf-8')
    const released = parseSchema(releasedSql)
    const current = parseSchema(schemaSql)
    const diff = diffSchemas(released, current)
    mode_warnings = findDestructiveWarnings(diff)

    // 既存 migration ファイルから次の version を採番
    const existing = await listExistingCartridgeMigrations(token, targetRepo, targetBranch, safe)
    const nextVerStr = determineNextVersion(safe, existing)
    schemaVersion = Number.parseInt(nextVerStr.replace(/^v/, ''), 10)

    if (diff.isEmpty) {
      return NextResponse.json(
        {
          ok: false,
          error: 'schema.sql と schema.released.sql に差分がありません。スキーマ変更がない場合はカートリッジリポに git push するだけで本番に反映されます (fetch-cartridges 経由)。',
          mode: installMode,
        },
        { status: 400 },
      )
    }

    const alterResult = generateAlterSql(diff, {
      cartridgeId: safe,
      nextVersion: nextVerStr,
      warnings: mode_warnings,
    })
    migrationSql = alterResult.sql
    manualChangesNeeded = alterResult.manualChangesNeeded
  } else {
    // === 初回モード: CREATE TABLE migration 生成 ===
    schemaVersion = 1
    migrationSql = generateInitialProductionMigration(safe, schemaSql, cartridgeRepo)
  }

  // PR 作成
  try {
    const result = await createCartridgeInstallPr(token, {
      cartridgeRepo,
      cartridgeRef: 'main',
      targetRepo,
      targetBase: targetBranch,
      cartridgeId: safe,
      version,
      schemaVersion,
      migrationSql,
      installMode,
    })
    return NextResponse.json({
      ok: true,
      ...result,
      installMode,
      warnings: mode_warnings,
      manualChangesNeeded,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg, installMode }, { status: 500 })
  }
}

const REGISTRY_PATH = join(process.cwd(), 'cartridges-registry.yaml')

/** Studio の registry から指定 cartridgeId の repo フィールドを取得 */
function findCartridgeRepo(cartridgeId: string): string | null {
  if (!existsSync(REGISTRY_PATH)) return null
  const text = readFileSync(REGISTRY_PATH, 'utf-8')
  let currentId: string | null = null
  let currentRepo: string | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trimEnd()
    if (!line.trim()) continue
    const idMatch = line.match(/^\s+- id:\s*(.+)$/)
    if (idMatch) {
      if (currentId === cartridgeId && currentRepo) return currentRepo
      currentId = idMatch[1].trim()
      currentRepo = null
      continue
    }
    const repoMatch = line.match(/^\s+repo:\s*(.+)$/)
    if (repoMatch) currentRepo = repoMatch[1].trim()
  }
  if (currentId === cartridgeId && currentRepo) return currentRepo
  return null
}

/** 初回投入用の本番 migration SQL (CREATE TABLE 系) を生成 */
function generateInitialProductionMigration(
  cartridgeId: string,
  schemaSql: string,
  sourceRepo: string,
): string {
  const ts = new Date().toISOString()
  let sql = ''
  sql += `-- Auto-generated by AppHarbor Studio (install-to-appharbor)\n`
  sql += `-- cartridge: ${cartridgeId}\n`
  sql += `-- mode:      INITIAL (CREATE TABLE)\n`
  sql += `-- source:    https://github.com/${sourceRepo}/blob/main/db/schema.sql\n`
  sql += `-- generated: ${ts}\n`
  sql += `-- NOTE: 適用するには \`npx supabase db push --linked\` または \`supabase migration up\` を実行してください\n\n`
  const cleaned = schemaSql
    .replace(/create\s+schema\s+if\s+not\s+exists\s+studio\s*;/gi, '')
    .replace(/set\s+search_path\s+to\s+studio\s*,?\s*public\s*;/gi, '')
    .replace(/studio\./g, '')
  sql += cleaned.trim() + '\n'
  return sql
}
