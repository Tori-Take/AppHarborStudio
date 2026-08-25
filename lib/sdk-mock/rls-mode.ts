import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

/**
 * カートリッジ単位の RLS 厳格モード設定。
 *
 * - 'off'（既定）… 従来どおり。全クエリを superuser（RLS を素通りする接続）で実行する
 * - 'strict'      … クエリを authenticated ロールへ一時的に SET LOCAL ROLE して実行し、
 *                    schema.sql に書かれた RLS ポリシーを実際に評価する
 *
 * db-source.ts と同じパターン（.studio-db/*.json に保存、mtime キャッシュ）。
 * 実行時の分岐は supabase-mock.ts の runQuery() が担う。
 */

export type RlsMode = 'off' | 'strict'

const STORE_PATH = join(process.cwd(), '.studio-db', 'rls-mode.json')

type Store = Record<string, RlsMode>

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

export function getRlsModeFor(appId: string | null): RlsMode {
  if (!appId) return 'off'
  return readStore()[appId] ?? 'off'
}

export function setRlsModeFor(appId: string, mode: RlsMode): void {
  const store = { ...readStore() }
  if (mode === 'off') delete store[appId]
  else store[appId] = mode
  mkdirSync(dirname(STORE_PATH), { recursive: true })
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
  _cache = null
}

/**
 * 現在のリクエスト（x-cartridge-id ヘッダー）の RLS モードを解決する。
 * Server Component / Route Handler から呼ぶこと（next/headers は server-only）。
 */
export async function resolveCurrentRlsMode(): Promise<RlsMode> {
  try {
    const { getCurrentCartridgeId } = await import('./db-source')
    const appId = await getCurrentCartridgeId()
    return getRlsModeFor(appId)
  } catch {
    return 'off'
  }
}
