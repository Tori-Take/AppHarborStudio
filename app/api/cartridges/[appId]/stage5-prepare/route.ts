import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { getCartridge } from '@/lib/cartridge-scanner'
import {
  parseSchema,
  diffSchemas,
  findDestructiveWarnings,
  generateAlterSql,
  type DestructiveWarning,
  type SchemaDiff,
} from '@/lib/schema-diff'

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
 * モード:
 *   - initial: db/schema.released.sql がない → 初回投入。CREATE TABLE migration を生成
 *   - update:  db/schema.released.sql がある → 改修。schema.sql との diff から ALTER migration を生成
 *
 * 生成物:
 *   - productionMigration: 本番 Supabase 用 migration SQL (initial: CREATE / update: ALTER)
 *   - registryEntry:       AppHarbor 本体の registry 用 YAML (initial のみ表示意義あり)
 *   - schemaReleasedSnapshot: 更新後に db/schema.released.sql としてコミットすべき内容
 *   - diff:                schema 差分 (update モードのみ)
 *   - warnings:            破壊的変更の警告 (update モードのみ)
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

  // 1. manifest.json
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

  // 2. db/schema.sql
  const schemaPath = join(cartDir, 'db', 'schema.sql')
  const schemaReleasedPath = join(cartDir, 'db', 'schema.released.sql')
  let schemaSql = ''
  if (existsSync(schemaPath)) {
    schemaSql = readFileSync(schemaPath, 'utf-8')
    const tableCount = (schemaSql.match(/create\s+table/gi) || []).length
    checks.push({ id: 'schema', label: 'db/schema.sql', ok: true, detail: `${tableCount} テーブル定義` })
  } else {
    checks.push({ id: 'schema', label: 'db/schema.sql', ok: false, detail: 'db/schema.sql が見つかりません' })
  }

  // 3. routes/
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

  // --- モード判定 ---
  const isUpdateMode = existsSync(schemaReleasedPath) && existsSync(schemaPath)

  // --- 生成物 ---
  const version = manifest?.version || '1.0.0'
  let productionMigration = ''
  let diff: SchemaDiff | null = null
  let warnings: DestructiveWarning[] = []
  let manualChangesNeeded: Array<{ table: string; column: string; reason: string }> = []
  let schemaReleasedSnapshot = ''

  if (existsSync(schemaPath)) {
    if (isUpdateMode) {
      // 更新モード: schema.released.sql と schema.sql を diff → ALTER 生成
      const releasedSql = readFileSync(schemaReleasedPath, 'utf-8')
      const releasedParsed = parseSchema(releasedSql)
      const currentParsed = parseSchema(schemaSql)
      diff = diffSchemas(releasedParsed, currentParsed)
      warnings = findDestructiveWarnings(diff)

      const alterResult = generateAlterSql(diff, {
        cartridgeId: safe,
        nextVersion: 'vNEXT', // install-to-appharbor で実際の vN+1 に置換される
        warnings,
      })
      productionMigration = alterResult.sql
      manualChangesNeeded = alterResult.manualChangesNeeded
      // 次回の比較基準は現在の schema.sql そのもの
      schemaReleasedSnapshot = schemaSql
    } else {
      // 初回モード: CREATE TABLE migration を生成
      productionMigration = generateInitialMigration(safe, schemaSql, manifest)
      // 初回 PR がマージされたら schema.sql を schema.released.sql としてコミットしてもらう
      schemaReleasedSnapshot = schemaSql
    }
  }

  // AppHarbor registry entry (初回投入時のみ意味あり)
  const registryEntry = repoSlug
    ? `  - id: ${safe}\n    repo: ${repoSlug}\n    ref: main\n    version: "${version}"\n    mode: installed\n    enabled: true`
    : `  - id: ${safe}\n    repo: YOUR_GITHUB_USER/${safe}\n    ref: main\n    version: "${version}"\n    mode: installed\n    enabled: true`

  const allOk = checks.every(c => c.ok)

  return NextResponse.json({
    checks,
    allOk,
    mode: isUpdateMode ? 'update' : 'initial',
    productionMigration,
    registryEntry,
    repoSlug,
    cartridgeId: safe,
    version,
    diff: diff
      ? {
          newTables: diff.newTables.map(t => t.name),
          droppedTables: diff.droppedTables.map(t => t.name),
          newColumns: diff.newColumns.map(c => ({ table: c.table, column: c.column.name, type: c.column.type })),
          droppedColumns: diff.droppedColumns.map(c => ({ table: c.table, column: c.column.name })),
          changedColumns: diff.changedColumns.map(c => ({
            table: c.table,
            column: c.column,
            beforeType: c.before.type,
            afterType: c.after.type,
          })),
          newPolicies: diff.newPolicies.map(p => ({ table: p.table, name: p.name, raw: p.raw })),
          droppedPolicies: diff.droppedPolicies.map(p => ({ table: p.table, name: p.name, raw: p.raw })),
          changedPolicies: diff.changedPolicies.map(c => ({
            table: c.table,
            name: c.name,
            beforeRaw: c.before.raw,
            afterRaw: c.after.raw,
          })),
          isEmpty: diff.isEmpty,
        }
      : null,
    warnings,
    manualChangesNeeded,
    schemaReleasedSnapshot,
  })
}

/**
 * 初回投入用: schema.sql を本番 Supabase 用 migration SQL (CREATE TABLE + RLS) に変換する。
 */
function generateInitialMigration(
  cartridgeId: string,
  schemaSql: string,
  manifest: { tables?: string[]; [key: string]: unknown } | null,
): string {
  const tables = manifest?.tables ?? extractTableNames(schemaSql)

  let sql = `-- =============================================================\n`
  sql += `-- Migration: cart_${cartridgeId.replace(/-/g, '_')}_v1\n`
  sql += `-- Generated: ${new Date().toISOString()}\n`
  sql += `-- Target: AppHarbor production (public schema)\n`
  sql += `-- Mode:   INITIAL\n`
  sql += `-- =============================================================\n\n`

  // Schema SQL (studio スキーマ参照を除去)
  const cleanedSchema = schemaSql
    .replace(/create\s+schema\s+if\s+not\s+exists\s+studio\s*;/gi, '')
    .replace(/set\s+search_path\s+to\s+studio\s*,?\s*public\s*;/gi, '')
    .replace(/studio\./g, '')
    .trim()

  sql += cleanedSchema
  sql += '\n\n'

  // RLS policies (manifest.tables ベース)
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
