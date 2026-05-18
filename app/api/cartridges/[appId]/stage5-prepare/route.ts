import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { spawnSync } from 'child_process'
import { getCartridge } from '@/lib/cartridge-scanner'
import { lintCartridge } from '@/lib/cartridge-lint'

type CheckItem = {
  id: string
  label: string
  ok: boolean
  detail: string
}

/**
 * Stage 5 の準備状況をチェックし、本番用の成果物を生成する。
 *
 * チェック項目:
 *   1. manifest.json が揃っているか (id, name, tables)
 *   2. db/schema.sql があるか
 *   3. routes/ があるか
 *   4. GitHub に push 済みか (Stage 4 前提)
 *
 * 生成物:
 *   - productionMigration: public スキーマ用の migration SQL
 *   - registryEntry: AppHarbor 本体の registry 用 YAML
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json({ error: 'cartridge not found' }, { status: 404 })
  }

  const cartDir = entry.path
  const checks: CheckItem[] = []

  // 1. manifest.json の内容チェック
  const manifest = entry.manifest
  if (manifest) {
    const hasId = !!manifest.id
    const hasName = !!(manifest.displayName || manifest.name)
    const hasTables = Array.isArray(manifest.tables) && manifest.tables.length > 0
    const hasPermissions = Array.isArray(manifest.permissions) && manifest.permissions.length > 0

    if (hasId && hasName && hasTables && hasPermissions) {
      checks.push({ id: 'manifest', label: 'manifest.json', ok: true, detail: `id: ${manifest.id}, tables: ${manifest.tables!.length}, permissions: ${manifest.permissions!.length}` })
    } else {
      const missing: string[] = []
      if (!hasId) missing.push('id')
      if (!hasName) missing.push('name/displayName')
      if (!hasTables) missing.push('tables[]')
      if (!hasPermissions) missing.push('permissions[]')
      checks.push({ id: 'manifest', label: 'manifest.json', ok: false, detail: `不足フィールド: ${missing.join(', ')}` })
    }
  } else {
    checks.push({ id: 'manifest', label: 'manifest.json', ok: false, detail: 'manifest.json が見つかりません' })
  }

  // 2. schema.sql の有無
  const schemaPath = join(cartDir, 'db', 'schema.sql')
  if (existsSync(schemaPath)) {
    const schemaSql = readFileSync(schemaPath, 'utf-8')
    const tableCount = (schemaSql.match(/create\s+table/gi) || []).length
    checks.push({ id: 'schema', label: 'db/schema.sql', ok: true, detail: `${tableCount} テーブル定義` })
  } else {
    checks.push({ id: 'schema', label: 'db/schema.sql', ok: false, detail: 'db/schema.sql が見つかりません' })
  }

  // 3. routes/ の有無
  const routesDir = join(cartDir, 'routes')
  if (existsSync(routesDir)) {
    checks.push({ id: 'routes', label: 'routes/', ok: true, detail: 'ルートフォルダ確認済み' })
  } else {
    checks.push({ id: 'routes', label: 'routes/', ok: false, detail: 'routes/ が見つかりません' })
  }

  // 4. GitHub push 済みか
  const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: cartDir, encoding: 'utf-8' })
  const repoRoot = probe.status === 0 ? (probe.stdout || '').trim() : null
  let repoSlug: string | null = null

  if (repoRoot) {
    const originUrl = spawnSync('git', ['config', '--get', 'remote.origin.url'], { cwd: repoRoot, encoding: 'utf-8' })
    const url = (originUrl.stdout || '').trim()
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/)
    if (m) repoSlug = `${m[1]}/${m[2]}`
  }

  if (repoSlug) {
    checks.push({ id: 'github', label: 'GitHub リポジトリ', ok: true, detail: repoSlug })
  } else {
    checks.push({ id: 'github', label: 'GitHub リポジトリ', ok: false, detail: 'GitHub にリポジトリがないか、push されていません' })
  }

  // 5. cartridge-lint: 規約違反 import / schema 規約違反がないか
  //    (cart-info-sender で踏んだ @appharbor/sdk → @/sdk 問題は ここで止める)
  try {
    const lintRes = lintCartridge(cartDir)
    const errs = lintRes.issues.filter((i) => i.severity === 'error')
    if (errs.length === 0) {
      checks.push({
        id: 'lint',
        label: 'カートリッジ lint',
        ok: true,
        detail: `${lintRes.filesScanned} ファイル走査・違反なし`,
      })
    } else {
      const first = errs[0]
      checks.push({
        id: 'lint',
        label: 'カートリッジ lint',
        ok: false,
        detail:
          `${errs.length} 件の error: ` +
          `${first.file}:${first.line} ${first.message}` +
          (errs.length > 1 ? ` (他 ${errs.length - 1} 件)` : ''),
      })
    }
  } catch (e) {
    checks.push({
      id: 'lint',
      label: 'カートリッジ lint',
      ok: false,
      detail: `lint 実行エラー: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // 6. 未コミット変更 / 未 push commit
  if (repoRoot) {
    const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf-8' })
    const dirtyLines = (dirty.stdout ?? '').split('\n').filter((l) => l.trim() !== '')
    const ahead = spawnSync('git', ['rev-list', '--count', '@{u}..HEAD'], { cwd: repoRoot, encoding: 'utf-8' })
    const aheadCount = parseInt((ahead.stdout ?? '0').trim(), 10) || 0
    if (dirtyLines.length === 0 && aheadCount === 0) {
      checks.push({ id: 'git-sync', label: 'Git 同期', ok: true, detail: 'クリーン (未コミット 0 / 未 push 0)' })
    } else {
      const parts: string[] = []
      if (dirtyLines.length > 0) parts.push(`未コミット ${dirtyLines.length} 件`)
      if (aheadCount > 0)        parts.push(`未 push ${aheadCount} 件`)
      checks.push({ id: 'git-sync', label: 'Git 同期', ok: false, detail: parts.join(' / ') })
    }
  }

  // --- 生成物 ---

  // Production migration SQL
  let productionMigration = ''
  if (existsSync(schemaPath)) {
    productionMigration = generateProductionMigration(safe, readFileSync(schemaPath, 'utf-8'), manifest)
  }

  // AppHarbor registry entry
  const version = manifest?.version || '1.0.0'
  const registryEntry = repoSlug
    ? `  - id: ${safe}\n    repo: ${repoSlug}\n    ref: main\n    version: "${version}"\n    mode: installed\n    enabled: true`
    : `  - id: ${safe}\n    repo: YOUR_GITHUB_USER/${safe}\n    ref: main\n    version: "${version}"\n    mode: installed\n    enabled: true`

  const allOk = checks.every(c => c.ok)

  return NextResponse.json({
    checks,
    allOk,
    productionMigration,
    registryEntry,
    repoSlug,
    cartridgeId: safe,
    version,
  })
}

/**
 * カートリッジの schema.sql を本番 Supabase 用 migration SQL に変換する。
 *
 * 変換ルール:
 *   - `studio` スキーマ参照を除去 (本番は public スキーマ)
 *   - `set search_path` を除去
 *   - RLS ポリシーのスタブを追加
 *   - organization_id ベースの基本 RLS を生成
 */
function generateProductionMigration(
  cartridgeId: string,
  schemaSql: string,
  manifest: { tables?: string[]; [key: string]: unknown } | null,
): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const tables = manifest?.tables ?? extractTableNames(schemaSql)

  let sql = `-- =============================================================\n`
  sql += `-- Migration: cart_${cartridgeId}_v1\n`
  sql += `-- Generated: ${new Date().toISOString()}\n`
  sql += `-- Target: AppHarbor production (public schema)\n`
  sql += `-- =============================================================\n\n`

  // Schema SQL (cleaned)
  let cleanedSchema = schemaSql
    // Remove studio schema references
    .replace(/create\s+schema\s+if\s+not\s+exists\s+studio\s*;/gi, '')
    .replace(/set\s+search_path\s+to\s+studio\s*,?\s*public\s*;/gi, '')
    // Remove studio. prefix from table references
    .replace(/studio\./g, '')
    .trim()

  sql += cleanedSchema
  sql += '\n\n'

  // RLS policies
  if (tables.length > 0) {
    sql += `-- =============================================================\n`
    sql += `-- RLS (Row Level Security)\n`
    sql += `-- =============================================================\n\n`

    for (const table of tables) {
      sql += `alter table ${table} enable row level security;\n`
    }
    sql += '\n'

    for (const table of tables) {
      sql += `create policy "${table}_org_isolation" on ${table}\n`
      sql += `  for all\n`
      sql += `  using (organization_id = (current_setting('app.current_org_id'))::uuid);\n\n`
    }
  }

  return sql
}

function extractTableNames(sql: string): string[] {
  const matches = sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:studio\.)?["']?(\w+)["']?/gi)
  return [...matches].map(m => m[1])
}
