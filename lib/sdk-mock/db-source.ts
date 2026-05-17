import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export type DbSource = 'pglite' | 'docker' | 'studio-cloud'

const STORE_PATH = join(process.cwd(), '.studio-db', 'db-source.json')

type Store = Record<string, DbSource>

let _cache: { mtime: number; store: Store } | null = null

function readStore(): Store {
  try {
    if (!existsSync(STORE_PATH)) {
      _cache = { mtime: 0, store: {} }
      return _cache.store
    }
    const stats = require('fs').statSync(STORE_PATH) as { mtimeMs: number }
    const mtime = Math.floor(stats.mtimeMs)
    if (_cache && _cache.mtime === mtime) return _cache.store
    const store = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as Store
    _cache = { mtime, store }
    return store
  } catch {
    return {}
  }
}

/**
 * 環境別デフォルト DB ソース。
 *   Vercel: PGlite は in-memory + Docker は届かないので studio-cloud
 *   ローカル: 従来通り pglite
 */
function defaultDbSource(): DbSource {
  const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV
  return isVercel ? 'studio-cloud' : 'pglite'
}

/**
 * 指定 appId の DB ソースを返す。env 別のデフォルトにフォールバック。
 */
export function getDbSourceFor(appId: string | null): DbSource {
  if (!appId) return defaultDbSource()
  return readStore()[appId] ?? defaultDbSource()
}

/**
 * 現在のリクエストのカートリッジ ID を返す。
 * middleware.ts が設定した x-cartridge-id ヘッダーから取得する。
 *
 * Server Component / Route Handler から呼ぶこと。
 * (next/headers は server-only)
 */
export async function getCurrentCartridgeId(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    return h.get('x-cartridge-id')
  } catch {
    return null
  }
}

/**
 * 現在のカートリッジの DB ソースを解決する。
 */
export async function resolveCurrentDbSource(): Promise<DbSource> {
  const appId = await getCurrentCartridgeId()
  return getDbSourceFor(appId)
}
