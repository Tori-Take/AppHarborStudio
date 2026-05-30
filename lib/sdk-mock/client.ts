/**
 * クライアント側モック SDK（@/sdk/client 相当）
 *
 * Studio Phase 2: ブラウザ側からも PGlite を読めるよう、
 * `/api/pg-query` 経由で QueryBuilder の実行をプロキシする。
 * shape は実 supabase-js / studio/lib/sdk-mock/supabase-mock.ts と互換。
 */

type MockError = { message: string }
type Row = Record<string, unknown>
// supabase-js のデフォルト型挙動に合わせる: 利用側で <Database> 型を渡さない場合
// data は実質 any として扱われる。Studio mock も同様に any[] にして
// 既存カートリッジの型期待 (e.g. PatrolWorkflowStep[]) を素通しさせる。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryResult = { data: any[] | null; error: MockError | null; count: number | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SingleResult = { data: any | null; error: MockError | null }

type FilterSpec =
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

class BrowserQueryBuilder {
  private spec: {
    table:    string
    op:       'select' | 'insert' | 'update' | 'delete' | 'upsert'
    columns?: string
    payload?: unknown
    filters:  FilterSpec[]
    orderBy?: { column: string; ascending: boolean }
    limit?:   number
    opts?:    SelectOpts
    upsert?:  { onConflict?: string }
    terminator?: 'thenable' | 'single' | 'maybeSingle'
  }

  constructor(table: string) {
    this.spec = { table, op: 'select', filters: [] }
  }

  select(columns?: string, opts?: SelectOpts) {
    if (columns) this.spec.columns = columns
    if (opts) this.spec.opts = { ...this.spec.opts, ...opts }
    return this
  }
  insert(row: Row | Row[])  { this.spec.op = 'insert'; this.spec.payload = row; return this }
  update(row: Row)          { this.spec.op = 'update'; this.spec.payload = row; return this }
  upsert(row: Row | Row[], opts?: { onConflict?: string }) {
    this.spec.op = 'upsert'; this.spec.payload = row; this.spec.upsert = opts; return this
  }
  delete()                  { this.spec.op = 'delete'; return this }

  eq(col: string, val: unknown)         { this.spec.filters.push({ kind: 'eq', col, val });    return this }
  neq(col: string, val: unknown)        { this.spec.filters.push({ kind: 'neq', col, val });   return this }
  in(col: string, vals: unknown[])      { this.spec.filters.push({ kind: 'in', col, vals });   return this }
  is(col: string, val: null | boolean)  { this.spec.filters.push({ kind: 'is', col, val });    return this }
  gt(col: string, val: unknown)         { this.spec.filters.push({ kind: 'gt', col, val });    return this }
  gte(col: string, val: unknown)        { this.spec.filters.push({ kind: 'gte', col, val });   return this }
  lt(col: string, val: unknown)         { this.spec.filters.push({ kind: 'lt', col, val });    return this }
  lte(col: string, val: unknown)        { this.spec.filters.push({ kind: 'lte', col, val });   return this }
  like(col: string, val: string)        { this.spec.filters.push({ kind: 'like', col, val });  return this }
  ilike(col: string, val: string)       { this.spec.filters.push({ kind: 'ilike', col, val }); return this }
  not(col: string, op: 'is' | 'eq' | 'in', val: unknown) {
    this.spec.filters.push({ kind: 'not', col, op, val })
    return this
  }

  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    void opts?.nullsFirst
    this.spec.orderBy = { column, ascending: opts?.ascending ?? true }
    return this
  }
  limit(n: number) { this.spec.limit = n; return this }

  then<T = QueryResult>(onfulfilled?: ((v: QueryResult) => T) | null): Promise<T> {
    this.spec.terminator = 'thenable'
    return this.send().then(onfulfilled as never) as Promise<T>
  }

  async single(): Promise<SingleResult> {
    this.spec.terminator = 'single'
    return await this.send() as SingleResult
  }
  async maybeSingle(): Promise<SingleResult> {
    this.spec.terminator = 'maybeSingle'
    return await this.send() as SingleResult
  }

  private async send(): Promise<unknown> {
    try {
      const res = await fetch('/api/pg-query', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'query', query: this.spec }),
      })
      if (!res.ok) return { data: null, error: { message: `pg-query HTTP ${res.status}` }, count: null }
      return await res.json()
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) }, count: null }
    }
  }
}

class BrowserAuth {
  async getUser(): Promise<{ data: { user: { id: string; email: string } | null }; error: null }> {
    const res = await fetch('/api/pg-query', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'auth', auth: { kind: 'getUser' } }),
    })
    if (!res.ok) return { data: { user: null }, error: null }
    return await res.json()
  }
}

// ─── Storage サブクライアント (no-op スタブ) ────────────────
class BrowserStorageBucket {
  constructor(private bucketId: string) {}
  async download(_path: string) {
    void _path
    return { data: new Blob([], { type: 'application/octet-stream' }), error: null }
  }
  async upload(path: string, _body: unknown, _opts?: unknown) {
    void _body; void _opts
    return { data: { path: `${this.bucketId}/${path}` }, error: null }
  }
  async createSignedUrl(path: string, _expiresIn: number) {
    void _expiresIn
    return { data: { signedUrl: `studio-mock://${this.bucketId}/${path}` }, error: null }
  }
  async remove(paths: string[]) {
    return { data: paths.map((p) => ({ name: p })), error: null }
  }
  getPublicUrl(path: string) {
    return { data: { publicUrl: `studio-mock://${this.bucketId}/${path}` } }
  }
}
class BrowserStorage {
  from(bucketId: string) { return new BrowserStorageBucket(bucketId) }
}

class BrowserSupabase {
  auth    = new BrowserAuth()
  storage = new BrowserStorage()
  from(table: string) { return new BrowserQueryBuilder(table) }
}

export function createBrowserSupabase(): BrowserSupabase {
  return new BrowserSupabase()
}

// 全画面カートリッジ用の「本体に戻る」ボタン（本体 @/sdk/client と shape を一致させる）
export { BackToAppHarbor } from './back-to-appharbor'
