import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { Client } from 'pg'
import { getCartridge } from '@/lib/cartridge-scanner'
import { getReadyPg } from '@/lib/sdk-mock/pg'
import { setupDockerSupabase, type SetupResult } from '@/lib/sdk-mock/docker-supabase-setup'
import { setupCloudSupabase } from '@/lib/sdk-mock/cloud-supabase-setup'

const BASE_SUPABASE_SQL = resolve(process.cwd(), 'lib', 'sdk-mock', 'db-base-supabase.sql')
const BASE_TABLES = ['organizations', 'departments', 'profiles', 'apps'] as const

/**
 * カートリッジを指定された Supabase に移行する。
 *
 * Stage 1 (PGlite) → 2 (Docker Supabase): target=docker
 * Stage 2 (Docker) → 3 (Studio Cloud Supabase): target=studio-cloud
 *
 * 移行内容:
 *   1. schema.sql を適用 (冪等)
 *   2. PGlite にあるデータを SELECT して INSERT (冪等: ON CONFLICT DO NOTHING)
 *
 * 接続先:
 *   - docker: env DOCKER_SUPABASE_DB_URL or postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *   - studio-cloud: env STUDIO_CLOUD_SUPABASE_DB_URL
 */

type MigrateTarget = 'docker' | 'studio-cloud'
type MigrateSource = 'pglite' | 'docker'

type MigrateBody = {
  target: MigrateTarget
  /** source 未指定時:
   *   target=docker      → 'pglite'
   *   target=studio-cloud → 'docker' (DOCKER_SUPABASE_DB_URL があれば) / 'pglite'
   */
  source?: MigrateSource
}

type TableResult = {
  table: string
  rowsRead: number
  rowsInserted: number
  error?: string
}

const DOCKER_DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function getConnectionString(target: MigrateTarget): string | null {
  if (target === 'docker') {
    return process.env.DOCKER_SUPABASE_DB_URL ?? DOCKER_DEFAULT_URL
  }
  if (target === 'studio-cloud') {
    return process.env.STUDIO_CLOUD_SUPABASE_DB_URL ?? null
  }
  return null
}

/** schema.sql から CREATE TABLE 文を抽出してテーブル名を返す */
function extractTableNames(schemaSql: string): string[] {
  const noComments = schemaSql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"?/gi
  const names = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(noComments)) !== null) names.add(m[1])
  return [...names]
}

/** 統一された source 読み取り interface */
type SourceReader = {
  kind: MigrateSource
  selectAll: (table: string) => Promise<Record<string, unknown>[]>
  close: () => Promise<void>
}

async function createSourceReader(source: MigrateSource): Promise<SourceReader> {
  if (source === 'docker') {
    const dockerUrl = process.env.DOCKER_SUPABASE_DB_URL ?? DOCKER_DEFAULT_URL
    const client = new Client({ connectionString: dockerUrl })
    await client.connect()
    return {
      kind: 'docker',
      selectAll: async (table: string) => {
        // Docker / クラウド側は studio スキーマに置かれている
        const res = await client.query(`SELECT * FROM "studio"."${table}"`)
        return res.rows as Record<string, unknown>[]
      },
      close: async () => { try { await client.end() } catch { /* ignore */ } },
    }
  }
  // pglite
  const pglite = await getReadyPg()
  return {
    kind: 'pglite',
    selectAll: async (table: string) => {
      const res = await pglite.query(`SELECT * FROM "${table}"`)
      return (res.rows ?? []) as Record<string, unknown>[]
    },
    close: async () => { /* PGlite シングルトンなので閉じない */ },
  }
}

/**
 * 移行先テーブルの json / jsonb 列名を取得する。
 *
 * node-postgres は JS 配列パラメータを Postgres の配列リテラル ({a,b,c}) に
 * 変換するため、jsonb 列に JSON 配列をそのまま渡すと
 * "invalid input syntax for type json" になる。
 * json/jsonb 列だけ事前に JSON.stringify して渡すための判定に使う。
 * (Array.isArray での無条件 stringify は本物の text[] 等の配列列を壊すので不可)
 */
async function getJsonColumns(pgClient: Client, table: string): Promise<Set<string>> {
  try {
    const res = await pgClient.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'studio' AND table_name = $1 AND data_type IN ('json', 'jsonb')`,
      [table],
    )
    return new Set(res.rows.map(r => String((r as { column_name: string }).column_name)))
  } catch {
    return new Set()
  }
}

/** source から全行を取り出し、Postgres の studio スキーマに INSERT (冪等) */
async function migrateTableData(
  source: SourceReader,
  pgClient: Client,
  table: string,
): Promise<TableResult> {
  const result: TableResult = { table, rowsRead: 0, rowsInserted: 0 }

  let rows: Record<string, unknown>[]
  try {
    rows = await source.selectAll(table)
    result.rowsRead = rows.length
  } catch (e) {
    result.error = `${source.kind} SELECT: ${e instanceof Error ? e.message : String(e)}`
    return result
  }

  if (rows.length === 0) return result

  // 全行のカラム名 (最初の行から取得 — 全行同じ前提)
  const columns = Object.keys(rows[0])
  if (columns.length === 0) return result

  const jsonColumns = await getJsonColumns(pgClient, table)

  // 1 行ずつ INSERT (簡易実装: 大量データだと遅いが正確)
  // studio スキーマ修飾で public との衝突を回避
  for (const row of rows) {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const colList = columns.map(c => `"${c}"`).join(', ')
    const values = columns.map(c => {
      const value = row[c]
      // source (PGlite / pg) は json/jsonb をパース済みの JS 値で返すため、
      // 文字列化して渡す (配列・オブジェクト・スカラーすべて同じ扱い)
      if (jsonColumns.has(c) && value !== null && value !== undefined) {
        return JSON.stringify(value)
      }
      return value
    })
    const sql = `INSERT INTO "studio"."${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`
    try {
      const r = await pgClient.query(sql, values)
      result.rowsInserted += r.rowCount ?? 0
    } catch (e) {
      result.error = `INSERT: ${e instanceof Error ? e.message : String(e)}`
      return result
    }
  }

  return result
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const id = decodeURIComponent(appId)

  let body: MigrateBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.target || (body.target !== 'docker' && body.target !== 'studio-cloud')) {
    return NextResponse.json({ ok: false, error: 'target must be docker or studio-cloud' }, { status: 400 })
  }

  const c = getCartridge(id)
  if (!c) {
    return NextResponse.json({ ok: false, error: `cartridge ${id} not found` }, { status: 404 })
  }

  const schemaPath = join(c.path, 'db', 'schema.sql')
  if (!existsSync(schemaPath)) {
    return NextResponse.json(
      { ok: false, error: `db/schema.sql が見つかりません: ${schemaPath}`, step: 'read' },
      { status: 400 },
    )
  }
  const schemaSql = readFileSync(schemaPath, 'utf-8')
  const tableNames = extractTableNames(schemaSql)

  const connectionString = getConnectionString(body.target)
  if (!connectionString) {
    return NextResponse.json(
      {
        ok: false,
        error: body.target === 'studio-cloud'
          ? 'STUDIO_CLOUD_SUPABASE_DB_URL が設定されていません。.env.local に接続情報を追加してください。'
          : 'Docker Supabase の接続先が解決できませ���',
        hint: body.target === 'studio-cloud'
          ? 'Supabase ダッシュボードの Settings > Database から接続文字列をコピーし、.env.local に STUDIO_CLOUD_SUPABASE_DB_URL=postgresql://... を追加してください'
          : undefined,
        step: 'config',
      },
      { status: 400 },
    )
  }

  const t0 = Date.now()
  const client = new Client({ connectionString })

  try {
    await client.connect()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        ok: false,
        error: `接続失敗: ${msg}`,
        hint: body.target === 'docker'
          ? '`supabase start` で Docker Supabase が起動しているか確認してください'
          : 'STUDIO_CLOUD_SUPABASE_DB_URL が正しいか確認してください。Supabase ダッシュボードの Settings > Database > Connection string (URI) をコピーしてください。',
        step: 'connect',
      },
      { status: 500 },
    )
  }

  let baseSchemaApplied = false
  let baseDataMigrated = false
  let schemaApplied = false
  let dataMigrated = false
  const tableResults: TableResult[] = []
  const errors: string[] = []

  // source の決定 (3: 完了済み Stage の最新から自動選択)
  //   target=docker      → 'pglite' (Stage 2 は PGlite → Docker のみ)
  //   target=studio-cloud → body.source 指定 > Docker 接続可なら 'docker' / なければ 'pglite'
  let source: MigrateSource = body.source ?? 'pglite'
  if (body.target === 'studio-cloud' && !body.source) {
    // Docker 接続可否を確認
    const dockerUrl = process.env.DOCKER_SUPABASE_DB_URL ?? DOCKER_DEFAULT_URL
    const probe = new Client({ connectionString: dockerUrl, connectionTimeoutMillis: 1500 })
    try {
      await probe.connect()
      await probe.query('SELECT 1')
      source = 'docker'
      await probe.end()
    } catch {
      source = 'pglite'
      try { await probe.end() } catch { /* ignore */ }
    }
  }

  let sourceReader: SourceReader
  try {
    sourceReader = await createSourceReader(source)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try { await client.end() } catch { /* ignore */ }
    return NextResponse.json(
      {
        ok: false,
        error: `source 接続失敗 (${source}): ${msg}`,
        hint: source === 'docker'
          ? 'Docker Supabase が起動しているか確認するか、source を指定しなおしてください'
          : undefined,
        step: 'source',
      },
      { status: 500 },
    )
  }

  try {

    // 1. ベーススキーマ適用 (organizations / profiles 等)
    if (existsSync(BASE_SUPABASE_SQL)) {
      try {
        await client.query(readFileSync(BASE_SUPABASE_SQL, 'utf-8'))
        baseSchemaApplied = true
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`base-schema: ${msg}`)
      }
    }

    // 2. ベーステーブルデータを source から移行
    //    順序重要: organizations → departments → profiles (FK)
    if (baseSchemaApplied) {
      for (const t of BASE_TABLES) {
        const r = await migrateTableData(sourceReader, client, t)
        tableResults.push(r)
        if (r.error) errors.push(`${t}: ${r.error}`)
      }
      baseDataMigrated = !errors.some(e => BASE_TABLES.some(t => e.startsWith(`${t}:`)))
    }

    // 3. カートリッジ schema.sql 適用 (studio スキーマで)
    if (baseSchemaApplied) {
      try {
        await client.query(`set search_path to studio, public;\n${schemaSql}`)
        schemaApplied = true
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`cartridge-schema: ${msg}`)
      }
    }

    // 3b. カートリッジテーブルにも PostgREST 用権限を再付与
    //     (ALTER DEFAULT PRIVILEGES は新規作成にしか効かないため、
    //      既に作られたテーブルにも明示的に GRANT)
    if (schemaApplied) {
      try {
        await client.query(`
          grant all on all tables    in schema studio to anon, authenticated, service_role;
          grant all on all sequences in schema studio to anon, authenticated, service_role;
        `)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`grants: ${msg}`)
      }
    }

    // 4. カートリッジテーブルデータを移行
    if (schemaApplied && tableNames.length > 0) {
      const before = errors.length
      for (const t of tableNames) {
        const r = await migrateTableData(sourceReader, client, t)
        tableResults.push(r)
        if (r.error) errors.push(`${t}: ${r.error}`)
      }
      dataMigrated = errors.length === before
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(`migrate: ${msg}`)
  } finally {
    try { await sourceReader.close() } catch { /* ignore */ }
    try { await client.end() } catch { /* ignore */ }
  }

  const duration = Date.now() - t0

  // 5. 環境セットアップ自動化
  let setup: SetupResult | null = null
  if (errors.length === 0) {
    try {
      if (body.target === 'docker') {
        setup = await setupDockerSupabase()
      } else if (body.target === 'studio-cloud') {
        setup = await setupCloudSupabase()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setup = {
        ok: false,
        steps: [{ name: 'setup', status: 'error', detail: msg }],
        followUps: [],
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        baseSchemaApplied,
        baseDataMigrated,
        schemaApplied,
        dataMigrated,
        tableResults,
        setup,
        error: errors.join('\n'),
        duration,
        step: 'apply',
        source,
        target: body.target,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    baseSchemaApplied,
    baseDataMigrated,
    schemaApplied,
    dataMigrated,
    tableResults,
    setup,
    duration,
    source,
    target: body.target,
  })
}

/**
 * 接続テストのみ実行。スキーマは触らない。
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  void params
  const url = new URL(req.url)
  const target = (url.searchParams.get('target') ?? 'docker') as MigrateTarget

  const connectionString = getConnectionString(target)
  if (!connectionString) {
    return NextResponse.json({ ok: false, configured: false })
  }

  const client = new Client({ connectionString })
  try {
    await client.connect()
    await client.query('SELECT 1')
    await client.end()
    return NextResponse.json({ ok: true, configured: true, connected: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, configured: true, connected: false, error: msg })
  }
}
