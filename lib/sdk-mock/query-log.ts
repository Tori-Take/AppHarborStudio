/**
 * クエリログ用のリングバッファ。
 *
 * supabase-mock / PGlite ラッパーから呼ばれ、最後の N 件を保持する。
 * /api/db/log エンドポイントが GET で読む。
 *
 * server-only: globalThis に保持して dev HMR を跨いでも消えないようにする。
 */

export type QueryLogEntry = {
  id:        string
  ts:        number
  sql:       string
  params?:   unknown[]
  rowCount?: number
  ms:        number
  error?:    string
  /** 表示用のラベル（カートリッジ名など、決まれば付与） */
  source?:   string
}

const MAX = 200

declare global {
  // eslint-disable-next-line no-var
  var __studioQueryLog: QueryLogEntry[] | undefined
}

function buf(): QueryLogEntry[] {
  if (!globalThis.__studioQueryLog) globalThis.__studioQueryLog = []
  return globalThis.__studioQueryLog
}

let counter = 0
export function pushQueryLog(entry: Omit<QueryLogEntry, 'id' | 'ts'>): void {
  const b = buf()
  b.push({ ...entry, id: String(++counter), ts: Date.now() })
  if (b.length > MAX) b.splice(0, b.length - MAX)
}

export function getQueryLog(sinceId?: string): QueryLogEntry[] {
  const b = buf()
  if (!sinceId) return b
  const idx = b.findIndex((e) => e.id === sinceId)
  if (idx < 0) return b
  return b.slice(idx + 1)
}

export function clearQueryLog(): void {
  buf().length = 0
}
