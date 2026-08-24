/**
 * PGlite ベースの Supabase 互換クライアント (Studio Phase 2)
 *
 * supabase-js のチェーン API を PostgreSQL クエリに変換する。
 * 対応操作:
 *   .from(table)
 *     .select(columns, { count?, head? })
 *       columns 例:
 *         '*'
 *         'id, name, parent_table!fk(child_col1, child_col2)'  ← 埋め込み join
 *     .insert(row | row[])
 *     .update(row)
 *     .upsert(row, { onConflict })
 *     .delete()
 *
 *     filter: .eq .neq .in .is .gt .gte .lt .lte .like .ilike
 *     modifier: .order(col, {ascending}) .limit(n)
 *     terminator: await thenable | .single() | .maybeSingle()
 *
 *   .auth.getUser() — Studio の現在ユーザーを返す
 *
 * 戻り値は実 supabase-js と同じ shape: { data, error, count? }
 */

import { getReadyPg, getPg } from './pg'
import { pushQueryLog } from './query-log'
import { getCurrentMockUserServer } from './server-context'
import { resolveCurrentRlsMode } from './rls-mode'

type Row = Record<string, unknown>
type MockError = { message: string }

// supabase-js のデフォルト型挙動に合わせて data は any。
// 実カートリッジ側は <Database> 型を持たないので、データは any として扱う想定。
export type QueryResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data:  any[] | null
  error: MockError | null
  count: number | null
}

type Filter =
  | { kind: 'eq';    col: string; val: unknown }
  | { kind: 'neq';   col: string; val: unknown }
  | { kind: 'in';    col: string; vals: unknown[] }
  | { kind: 'is';    col: string; val: null | boolean }
  | { kind: 'gt';    col: string; val: unknown }
  | { kind: 'gte';   col: string; val: unknown }
  | { kind: 'lt';    col: string; val: unknown }
  | { kind: 'lte';   col: string; val: unknown }
  | { kind: 'like';  col: string; val: string }
  | { kind: 'ilike'; col: string; val: string }
  | { kind: 'not';   col: string; op: 'is' | 'eq' | 'in'; val: unknown }

type SelectOpts = { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }

/**
 * `'id, name, parent!fk(a, b), other'` を分解する。
 * カンマで分割するが括弧内のカンマは無視する。
 */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0, buf = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = '' }
    else buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

type ParsedColumns = {
  scalars:    string[]                         // 上位テーブルの列名
  joins:      Array<{                          // ネスト join
    table:    string                           // 親テーブル名
    fk:       string | null                    // !fk または !inner
    inner:    boolean                          // !inner 指定か
    cols:     string[]                         // 抽出する子列
  }>
}

function parseColumns(spec: string): ParsedColumns {
  const scalars: string[] = []
  const joins:   ParsedColumns['joins'] = []
  for (const part of splitTopLevel(spec)) {
    // パターン: tableName!fk(col, col, ...)  または  tableName(col, ...)
    const m = part.match(/^(\w+)(?:!(\w+))?\s*\(([^)]*)\)$/)
    if (m) {
      const table = m[1]
      const fkRaw = m[2] ?? null
      const inner = fkRaw === 'inner'
      const cols  = m[3].split(',').map((c) => c.trim()).filter(Boolean)
      joins.push({ table, fk: inner ? null : fkRaw, inner, cols })
    } else {
      scalars.push(part)
    }
  }
  return { scalars, joins }
}

function quoteIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

/**
 * RLS 厳格モードに応じてクエリを実行する。
 *
 * - off（既定）: 従来どおり getReadyPg() 経由（superuser 接続。RLS ポリシーは素通り）
 * - strict     : authenticated ロールへ一時的に SET LOCAL ROLE し、Studio で現在
 *                選択中の仮ユーザーを request.user_id に設定してから実行する。
 *                schema.sql の RLS ポリシー（auth.uid() 経由）が実際に評価される。
 *                トランザクション内の SET LOCAL は commit/rollback で自動的に戻るため、
 *                他のリクエストへ role が漏れる心配はない（PGlite の transaction() は
 *                実行中ほかのクエリを割り込ませない）。
 */
async function runQuery<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
  const mode = await resolveCurrentRlsMode()
  if (mode !== 'strict') {
    const db = await getReadyPg()
    return db.query<T>(sql, params)
  }

  const user = await getCurrentMockUserServer()
  const h = getPg()
  await h.ready
  const t0 = Date.now()
  try {
    const res = await h.db.transaction(async (tx) => {
      // db-base.sql がセッション全体に `row_security = off` を敷いている
      // （superuser 接続では通常無関係だが、authenticated ロールに切り替えた
      // 瞬間に効いてしまい "row_security is off" エラーになるため、
      // このトランザクション内だけ明示的に on へ戻す）
      await tx.query(`set local row_security = on`)
      await tx.query(`set local role authenticated`)
      await tx.query(`select set_config('request.user_id', $1, true)`, [user.id])
      return await tx.query<T>(sql, params)
    })
    pushQueryLog({ sql, params, rowCount: res.rows.length, ms: Date.now() - t0, source: 'strict' })
    return res
  } catch (e) {
    pushQueryLog({
      sql, params, ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
      source: 'strict',
    })
    throw e
  }
}

/**
 * PGlite は DATE / TIMESTAMP カラムを Date オブジェクトで返す。
 * 実 Supabase / PostgREST は ISO 文字列で返すため、cartridge コードは
 * string を前提に書かれている (e.g. JSX で {row.created_at} と直接描画)。
 * ここで全行を再帰的に走査して Date → ISO string に正規化する。
 */
function normalizeDates<T>(value: T): T {
  if (value instanceof Date) {
    return value.toISOString() as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => normalizeDates(v)) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeDates(v)
    }
    return out as unknown as T
  }
  return value
}

/**
 * single() / maybeSingle() の戻り値型
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SingleResult = { data: any | null; error: MockError | null }

class QueryBuilder {
  private table:    string
  private filters:  Filter[] = []
  private orderBy:  { column: string; ascending: boolean } | null = null
  private limitN:   number | null = null
  private op:       'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private payload:  Row | Row[] | null = null
  private columns:  string = '*'
  private opts:     SelectOpts = {}
  private upsertOnConflict: string | null = null

  constructor(table: string) { this.table = table }

  select(columns?: string, opts?: SelectOpts) {
    if (this.op === 'select' || this.op === 'insert' || this.op === 'update' || this.op === 'upsert') {
      // insert().select() は INSERT ... RETURNING のため select 列だけ記録
      if (this.op === 'select') this.op = 'select'
    }
    if (columns) this.columns = columns
    if (opts) this.opts = { ...this.opts, ...opts }
    return this
  }
  insert(row: Row | Row[])               { this.op = 'insert'; this.payload = row; return this }
  update(row: Row)                       { this.op = 'update'; this.payload = row; return this }
  upsert(row: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert'
    this.payload = row
    this.upsertOnConflict = opts?.onConflict ?? null
    return this
  }
  delete()                               { this.op = 'delete'; return this }

  eq(col: string, val: unknown)          { this.filters.push({ kind: 'eq',   col, val }); return this }
  neq(col: string, val: unknown)         { this.filters.push({ kind: 'neq',  col, val }); return this }
  in(col: string, vals: unknown[])       { this.filters.push({ kind: 'in',   col, vals }); return this }
  is(col: string, val: null | boolean)   { this.filters.push({ kind: 'is',   col, val }); return this }
  gt(col: string, val: unknown)          { this.filters.push({ kind: 'gt',   col, val }); return this }
  gte(col: string, val: unknown)         { this.filters.push({ kind: 'gte',  col, val }); return this }
  lt(col: string, val: unknown)          { this.filters.push({ kind: 'lt',   col, val }); return this }
  lte(col: string, val: unknown)         { this.filters.push({ kind: 'lte',  col, val }); return this }
  like(col: string, val: string)         { this.filters.push({ kind: 'like', col, val }); return this }
  ilike(col: string, val: string)        { this.filters.push({ kind: 'ilike', col, val }); return this }
  not(col: string, op: 'is' | 'eq' | 'in', val: unknown) {
    this.filters.push({ kind: 'not', col, op, val })
    return this
  }

  // 第二引数の nullsFirst は受け付けるが、PG のデフォルト（asc=NULLS LAST, desc=NULLS FIRST）を使う
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    void opts?.nullsFirst
    this.orderBy = { column, ascending: opts?.ascending ?? true }
    return this
  }
  limit(n: number) { this.limitN = n; return this }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as never, onrejected)
  }

  async maybeSingle(): Promise<SingleResult> {
    const { data, error } = await this.execute()
    if (error) return { data: null, error }
    if (!data || data.length === 0) return { data: null, error: null }
    if (data.length > 1) return { data: null, error: { message: 'multiple rows returned' } }
    return { data: data[0], error: null }
  }

  async single(): Promise<SingleResult> {
    const { data, error } = await this.execute()
    if (error) return { data: null, error }
    if (!data || data.length !== 1) return { data: null, error: { message: 'expected exactly one row' } }
    return { data: data[0], error: null }
  }

  // ─── SQL 組み立て ──────────────────────────────────────────
  private buildWhere(params: unknown[], tableAlias?: string): string {
    if (this.filters.length === 0) return ''
    const prefix = tableAlias ? `${quoteIdent(tableAlias)}.` : ''
    const clauses: string[] = []
    for (const f of this.filters) {
      const col = `${prefix}${quoteIdent(f.col)}`
      switch (f.kind) {
        case 'eq':    params.push(f.val); clauses.push(`${col} = $${params.length}`); break
        case 'neq':   params.push(f.val); clauses.push(`${col} <> $${params.length}`); break
        case 'gt':    params.push(f.val); clauses.push(`${col} > $${params.length}`); break
        case 'gte':   params.push(f.val); clauses.push(`${col} >= $${params.length}`); break
        case 'lt':    params.push(f.val); clauses.push(`${col} < $${params.length}`); break
        case 'lte':   params.push(f.val); clauses.push(`${col} <= $${params.length}`); break
        case 'like':  params.push(f.val); clauses.push(`${col} like $${params.length}`); break
        case 'ilike': params.push(f.val); clauses.push(`${col} ilike $${params.length}`); break
        case 'is':
          if (f.val === null) clauses.push(`${col} is null`)
          else                clauses.push(`${col} is ${f.val ? 'true' : 'false'}`)
          break
        case 'in': {
          if (f.vals.length === 0) { clauses.push('false'); break }
          const ph = f.vals.map((v) => { params.push(v); return `$${params.length}` }).join(', ')
          clauses.push(`${col} in (${ph})`)
          break
        }
        case 'not': {
          if (f.op === 'is') {
            const v = f.val
            if (v === null) clauses.push(`${col} is not null`)
            else            clauses.push(`${col} is not ${v ? 'true' : 'false'}`)
          } else if (f.op === 'eq') {
            params.push(f.val); clauses.push(`${col} <> $${params.length}`)
          } else if (f.op === 'in') {
            const vals = Array.isArray(f.val) ? (f.val as unknown[]) : []
            if (vals.length === 0) clauses.push('true')
            else {
              const ph = vals.map((v) => { params.push(v); return `$${params.length}` }).join(', ')
              clauses.push(`${col} not in (${ph})`)
            }
          }
          break
        }
      }
    }
    return ' where ' + clauses.join(' and ')
  }

  private buildOrderLimit(): string {
    let s = ''
    if (this.orderBy) {
      s += ` order by ${quoteIdent(this.orderBy.column)} ${this.orderBy.ascending ? 'asc' : 'desc'}`
    }
    if (this.limitN !== null) s += ` limit ${this.limitN}`
    return s
  }

  private async execute(): Promise<QueryResult> {
    try {
      switch (this.op) {
        case 'insert':
        case 'upsert': {
          const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
          if (rows.length === 0) return { data: [], error: null, count: 0 }
          const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
          const params: unknown[] = []
          const values = rows.map((r) =>
            '(' + cols.map((c) => {
              params.push(r[c] ?? null)
              return `$${params.length}`
            }).join(', ') + ')',
          ).join(', ')
          let sql = `insert into ${quoteIdent(this.table)} (${cols.map(quoteIdent).join(', ')}) values ${values}`
          if (this.op === 'upsert') {
            const conflictCols = (this.upsertOnConflict ?? cols[0])
              .split(',').map((c) => quoteIdent(c.trim())).join(', ')
            const updates = cols.map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`).join(', ')
            sql += ` on conflict (${conflictCols}) do update set ${updates}`
          }
          sql += ' returning *'
          const res = await runQuery<Row>(sql, params)
          return { data: normalizeDates(res.rows), error: null, count: res.rows.length }
        }
        case 'select': {
          const parsed = parseColumns(this.columns)
          // JOIN がある場合は JOIN クエリを組み立て、行を後処理でネストする
          if (parsed.joins.length > 0) {
            return await this.executeWithJoins(parsed)
          }
          const params: unknown[] = []
          const where = this.buildWhere(params)
          // count + head
          if (this.opts.head && this.opts.count) {
            const csql = `select count(*)::int as c from ${quoteIdent(this.table)}${where}`
            const r = await runQuery<{ c: number }>(csql, params)
            const c = Number(r.rows[0].c)
            return { data: null, error: null, count: c }
          }
          const colsSql = this.columns === '*'
            ? '*'
            : parsed.scalars.map(quoteIdent).join(', ')
          const sql = `select ${colsSql} from ${quoteIdent(this.table)}${where}${this.buildOrderLimit()}`
          const res = await runQuery<Row>(sql, params)
          let count: number | null = res.rows.length
          if (this.opts.count) {
            const csql = `select count(*)::int as c from ${quoteIdent(this.table)}${where}`
            const r = await runQuery<{ c: number }>(csql, params)
            count = Number(r.rows[0].c)
          }
          return { data: normalizeDates(res.rows), error: null, count }
        }
        case 'update': {
          const params: unknown[] = []
          const sets = Object.entries(this.payload as Row).map(([k, v]) => {
            params.push(v)
            return `${quoteIdent(k)} = $${params.length}`
          }).join(', ')
          const where = this.buildWhere(params)
          const sql = `update ${quoteIdent(this.table)} set ${sets}${where}`
          await runQuery(sql, params)
          return { data: null, error: null, count: null }
        }
        case 'delete': {
          const params: unknown[] = []
          const where = this.buildWhere(params)
          const sql = `delete from ${quoteIdent(this.table)}${where}`
          await runQuery(sql, params)
          return { data: null, error: null, count: null }
        }
      }
    } catch (e) {
      console.error('[supabase-mock] query error:', e)
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) }, count: null }
    }
    return { data: null, error: null, count: null }
  }

  /**
   * 埋め込み join を実行: 親テーブル(this.table)の各行に joins[].cols を
   * ネストされたオブジェクトとして埋め込む。
   * 制約: 単一値 join のみ（PostgREST の M:N は未対応）。
   * 解決: PostgreSQL 情報スキーマから FK を引き、生成した SQL で LEFT/INNER JOIN。
   */
  private async executeWithJoins(
    parsed: ParsedColumns,
  ): Promise<QueryResult> {
    const params: unknown[] = []
    const baseAlias = 't0'
    const selectExprs: string[] = []
    const isAll = parsed.scalars.includes('*')
    if (isAll) {
      // 親テーブルの全列を取得（alias なし）
      selectExprs.push(`${quoteIdent(baseAlias)}.*`)
    } else {
      for (const c of parsed.scalars) {
        selectExprs.push(`${quoteIdent(baseAlias)}.${quoteIdent(c)} as ${quoteIdent('__s_' + c)}`)
      }
    }
    // join 句と select
    const joinClauses: string[] = []
    for (let i = 0; i < parsed.joins.length; i++) {
      const j = parsed.joins[i]
      const alias = `j${i}`
      // FK 名指定 (`!fkName`) は無視して、両者の関係を情報スキーマから推論する。
      // 子テーブル → 親テーブル の最初の FK を使う。
      const fkInfo = await runQuery<{
        local_col:   string
        foreign_col: string
        side:        'child_to_parent' | 'parent_to_child'
      }>(
        `select kcu.column_name as local_col, ccu.column_name as foreign_col,
                'child_to_parent'::text as side
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
         where tc.constraint_type = 'FOREIGN KEY'
           and tc.table_name = $1 and ccu.table_name = $2
         union all
         select kcu.column_name as local_col, ccu.column_name as foreign_col,
                'parent_to_child'::text as side
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
         where tc.constraint_type = 'FOREIGN KEY'
           and tc.table_name = $2 and ccu.table_name = $1
         limit 1`,
        [this.table, j.table],
      )
      if (fkInfo.rows.length === 0) {
        return { data: null, error: { message: `埋め込み join 不可: ${this.table} と ${j.table} の FK が見つかりません` }, count: null }
      }
      const fk = fkInfo.rows[0] as { local_col: string; foreign_col: string; side: string }
      // child_to_parent: this.table が子で local_col を持ち、j.table の foreign_col と一致
      // parent_to_child: this.table が親で foreign_col を持ち、j.table の local_col と一致（this 側にいる場合）
      let onClause: string
      if (fk.side === 'child_to_parent') {
        onClause = `${quoteIdent(alias)}.${quoteIdent(fk.foreign_col)} = ${quoteIdent(baseAlias)}.${quoteIdent(fk.local_col)}`
      } else {
        onClause = `${quoteIdent(alias)}.${quoteIdent(fk.local_col)} = ${quoteIdent(baseAlias)}.${quoteIdent(fk.foreign_col)}`
      }
      const joinKw = j.inner ? 'inner join' : 'left join'
      joinClauses.push(`${joinKw} ${quoteIdent(j.table)} as ${quoteIdent(alias)} on ${onClause}`)
      // join 列を select
      for (const c of j.cols) {
        selectExprs.push(`${quoteIdent(alias)}.${quoteIdent(c)} as ${quoteIdent('__j' + i + '_' + c)}`)
      }
    }
    const where = this.buildWhere(params, baseAlias)
    const orderLimit = this.buildOrderLimit().replace(/order by "([^"]+)"/, `order by ${quoteIdent(baseAlias)}."$1"`)
    const sql = `select ${selectExprs.join(', ')}
                 from ${quoteIdent(this.table)} as ${quoteIdent(baseAlias)}
                 ${joinClauses.join(' ')}
                 ${where}${orderLimit}`
    const res = await runQuery<Row>(sql, params)
    // 後処理: __s_X / __jN_Y を { col: ..., joinedTable: { col: ... } } に再構築
    const out: Row[] = []
    for (const raw of res.rows as Row[]) {
      const row: Row = {}
      if (isAll) {
        // 親テーブルの全列をそのままコピー（__jN_Y は除外）
        for (const k of Object.keys(raw)) {
          if (!k.startsWith('__j')) row[k] = raw[k]
        }
      } else {
        for (const c of parsed.scalars) row[c] = raw['__s_' + c]
      }
      for (let i = 0; i < parsed.joins.length; i++) {
        const j = parsed.joins[i]
        const obj: Row = {}
        for (const c of j.cols) obj[c] = raw['__j' + i + '_' + c]
        // すべて null の場合は null を返す（PostgREST 流儀）
        const allNull = j.cols.every((c) => obj[c] === null || obj[c] === undefined)
        row[j.table] = allNull && !j.inner ? null : obj
      }
      out.push(row)
    }
    return { data: normalizeDates(out), error: null, count: out.length }
  }
}

// ─── auth サブクライアント ──────────────────────────────────
class AuthMock {
  async getUser(): Promise<{ data: { user: { id: string; email: string } | null }; error: null }> {
    const r = await getReadyPg()
    const res = await r.query<{ id: string; email: string }>('select auth.uid() as id, (select email from auth.users where id = auth.uid()) as email')
    const row = res.rows[0]
    if (!row?.id) return { data: { user: null }, error: null }
    return { data: { user: { id: String(row.id), email: String(row.email ?? '') } }, error: null }
  }
}

// ─── Storage サブクライアント (ローカルファイル保存) ──────────
// .studio-db/storage/{bucket}/{path} にファイルを保存し、
// /api/studio-storage?bucket=...&path=... で配信する。
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { existsSync } from 'fs'

const STORAGE_ROOT = join(process.cwd(), '.studio-db', 'storage')

class StorageBucketMock {
  constructor(private bucketId: string) {}

  private filePath(path: string): string {
    return join(STORAGE_ROOT, this.bucketId, path)
  }

  async download(path: string): Promise<{ data: Blob | null; error: MockError | null }> {
    const fp = this.filePath(path)
    if (!existsSync(fp)) return { data: null, error: { message: 'File not found' } }
    const buf = readFileSync(fp)
    return { data: new Blob([buf]), error: null }
  }

  async upload(path: string, body: unknown, _opts?: unknown): Promise<{ data: { path: string } | null; error: MockError | null }> {
    try {
      const fp = this.filePath(path)
      mkdirSync(dirname(fp), { recursive: true })
      if (body instanceof Blob || body instanceof File) {
        const buf = Buffer.from(await (body as Blob).arrayBuffer())
        writeFileSync(fp, buf)
      } else if (Buffer.isBuffer(body)) {
        writeFileSync(fp, body)
      } else if (body instanceof ArrayBuffer) {
        writeFileSync(fp, Buffer.from(body))
      }
      return { data: { path }, error: null }
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : 'Upload failed' } }
    }
  }

  async createSignedUrl(path: string, _expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: MockError | null }> {
    const fp = this.filePath(path)
    if (!existsSync(fp)) return { data: null, error: { message: 'File not found' } }
    const url = `/api/studio-storage?bucket=${encodeURIComponent(this.bucketId)}&path=${encodeURIComponent(path)}`
    return { data: { signedUrl: url }, error: null }
  }

  async remove(paths: string[]): Promise<{ data: Array<{ name: string }>; error: MockError | null }> {
    for (const p of paths) {
      const fp = this.filePath(p)
      try { if (existsSync(fp)) unlinkSync(fp) } catch { /* ignore */ }
    }
    return { data: paths.map((p) => ({ name: p })), error: null }
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    return { data: { publicUrl: `/api/studio-storage?bucket=${encodeURIComponent(this.bucketId)}&path=${encodeURIComponent(path)}` } }
  }
}

class StorageMock {
  from(bucketId: string) { return new StorageBucketMock(bucketId) }
}

class SupabaseClientMock {
  auth    = new AuthMock()
  storage = new StorageMock()
  from(table: string) { return new QueryBuilder(table) }
}

let _client: SupabaseClientMock | null = null

/**
 * 同期版: PGlite モックのみを返す。
 * Vercel デプロイ環境では実 Supabase を返す (後方互換)。
 *
 * カートリッジ起動時の DB ソース切替 (pglite / docker / studio-cloud) は
 * getSupabaseForCurrentCartridge() を使うこと。
 */
export function getSupabaseMock(): SupabaseClientMock {
  if (process.env.VERCEL) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRealSupabaseAdmin, isRealSupabaseConfigured } = require('./supabase-real')
    if (isRealSupabaseConfigured()) {
      return getRealSupabaseAdmin() as SupabaseClientMock
    }
  }
  if (!_client) _client = new SupabaseClientMock()
  return _client
}

/**
 * 非同期版: x-cartridge-id ヘッダーから現在のカートリッジを特定し、
 * 保存された DB ソース選択に従って適切なクライアントを返す。
 *
 * - pglite       → SupabaseClientMock (PGlite 経由)
 * - docker       → Supabase JS Client (Docker のローカル Supabase, studio スキーマ)
 * - studio-cloud → Supabase JS Client (Studio 専用クラウド, studio スキーマ)
 *
 * ヘッダーが無い (Studio 自身のページ) ときは PGlite。
 * Vercel 環境では db-source.ts の defaultDbSource() が studio-cloud に
 * フォールバックするので、Studio Cloud Supabase に接続される。
 */
export async function getSupabaseForCurrentCartridge(): Promise<SupabaseClientMock> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolveCurrentDbSource, getCurrentCartridgeId } = require('./db-source') as typeof import('./db-source')
  const appId  = await getCurrentCartridgeId()
  const source = await resolveCurrentDbSource()
  console.log(`[supabase-mock] resolve: appId=${appId} source=${source}`)

  if (source === 'pglite') {
    if (!_client) _client = new SupabaseClientMock()
    return _client
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getRealSupabaseAdminFor } = require('./supabase-real') as typeof import('./supabase-real')
  const target = source === 'docker' ? 'docker' : 'studio-cloud'
  const real = getRealSupabaseAdminFor(target)
  if (real) {
    console.log(`[supabase-mock] using ${target} client`)
    return real as SupabaseClientMock
  }

  // フォールバック: studio-cloud 未設定 + 旧 STUDIO_SUPABASE_* がある場合は
  // 後方互換のため vercel-studio クライアントを試す
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getRealSupabaseAdmin, isRealSupabaseConfigured } = require('./supabase-real')
  if (process.env.VERCEL && isRealSupabaseConfigured()) {
    console.log(`[supabase-mock] fallback to vercel-studio (legacy STUDIO_SUPABASE_*)`)
    return getRealSupabaseAdmin() as SupabaseClientMock
  }

  console.warn(`[supabase-mock] ${source} の設定が無いため PGlite にフォールバック`)
  if (!_client) _client = new SupabaseClientMock()
  return _client
}
