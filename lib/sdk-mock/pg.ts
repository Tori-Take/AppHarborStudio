/**
 * PGlite シングルトン
 *
 * - サーバープロセス内に1つだけ DB を保持（Next.js dev は globalThis に固定）
 * - .studio-db/pgdata にファイル永続化
 * - 起動時にベーススキーマと各カートリッジ schema.sql を順次適用
 */

import { PGlite } from '@electric-sql/pglite'
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { pushQueryLog } from './query-log'

const STUDIO_ROOT = resolve(process.cwd())
const DB_DIR      = join(STUDIO_ROOT, '.studio-db', 'pgdata')
const BASE_SQL    = join(STUDIO_ROOT, 'lib', 'sdk-mock', 'db-base.sql')

type DbHandle = {
  db:    PGlite
  ready: Promise<void>
}

declare global {
  // eslint-disable-next-line no-var
  var __studioPg: DbHandle | undefined
}

function resolveCartridgesRoot(): string {
  if (process.env.STUDIO_CARTRIDGES_PATH) {
    return resolve(STUDIO_ROOT, process.env.STUDIO_CARTRIDGES_PATH)
  }
  const local = join(STUDIO_ROOT, 'cartridges')
  if (existsSync(local)) return local
  const parent = resolve(STUDIO_ROOT, '..', 'cartridges')
  if (existsSync(parent)) return parent
  return join(STUDIO_ROOT, 'workspace')
}

const isVercel = !!process.env.VERCEL

async function applySchemas(db: PGlite, seedSampleData = false) {
  // ベーススキーマ
  if (existsSync(BASE_SQL)) {
    const sql = readFileSync(BASE_SQL, 'utf-8')
    try {
      await db.exec(sql)
      console.log('[studio-pg] ベーススキーマを適用しました')
    } catch (e) {
      console.error('[studio-pg] ベーススキーマ適用エラー:', e)
    }
  }

  // 各カートリッジの db/schema.sql
  // _local / _installed / 直置き の 3 ソースから収集（同 id は _local 優先）
  const root = resolveCartridgesRoot()
  if (!existsSync(root)) return
  const cartridgePaths = new Map<string, string>()
  for (const src of [join(root, '_local'), join(root, '_installed'), root]) {
    if (!existsSync(src)) continue
    for (const name of readdirSync(src)) {
      if (name.startsWith('_') || name.startsWith('.')) continue
      const full = join(src, name)
      try { if (!statSync(full).isDirectory()) continue } catch { continue }
      if (!existsSync(join(full, 'manifest.json'))) continue
      if (!cartridgePaths.has(name)) cartridgePaths.set(name, full)
    }
  }
  for (const [name, dir] of cartridgePaths) {

    // studioCompatible: false ならスキップ
    const manifestPath = join(dir, 'manifest.json')
    if (existsSync(manifestPath)) {
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (m.studioCompatible === false) continue
      } catch { /* ignore */ }
    }

    const schemaPath = join(dir, 'db', 'schema.sql')
    if (!existsSync(schemaPath)) continue

    const sql = readFileSync(schemaPath, 'utf-8')
    try {
      await db.exec(sql)
      console.log(`[studio-pg] カートリッジ ${name} のスキーマを適用しました`)
    } catch (e) {
      console.warn(`[studio-pg] カートリッジ ${name} のスキーマ適用で警告:`, e instanceof Error ? e.message : e)
    }

    if (seedSampleData) {
      const samplePath = join(dir, 'db', 'sample-data.sql')
      if (existsSync(samplePath)) {
        try {
          await db.exec(readFileSync(samplePath, 'utf-8'))
          console.log(`[studio-pg] カートリッジ ${name} のサンプルデータを適用しました`)
        } catch (e) {
          console.warn(`[studio-pg] カートリッジ ${name} のサンプルデータ適用で警告:`, e instanceof Error ? e.message : e)
        }
      }
    }
  }
}

function init(): DbHandle {
  let db: PGlite
  let mode = 'unknown'

  if (isVercel) {
    // Vercel: サーバーレスは読み取り専用FS → 最初から in-memory
    console.log('[studio-pg] Vercel 環境検出 → in-memory + サンプルデータ自動投入')
    db = new PGlite()
    mode = 'in-memory (Vercel)'
  } else {
    // ローカル: ファイル永続化を試行
    try {
      mkdirSync(DB_DIR, { recursive: true })
      const dataPath = DB_DIR.replace(/\\/g, '/')
      console.log('[studio-pg] ファイル永続化を試行 →', dataPath)
      db = new PGlite({ dataDir: dataPath })
      mode = 'fs (' + process.platform + ')'
    } catch (e) {
      console.warn('[studio-pg] ファイル永続化失敗 → in-memory に fallback:', e instanceof Error ? e.message : e)
      db = new PGlite()
      mode = 'in-memory (再起動で消失)'
    }
  }

  const seedSample = isVercel || mode.startsWith('in-memory')
  const ready = (async () => {
    try {
      await db.waitReady
      await applySchemas(db, seedSample)
      console.log('[studio-pg] ready (mode:', mode, ')')
    } catch (e) {
      console.error('[studio-pg] init エラー:', e)
      if (!mode.startsWith('in-memory')) {
        console.warn('[studio-pg] 永続化 DB 異常 → in-memory で再構築')
        db = new PGlite()
        await db.waitReady
        await applySchemas(db, true)
        mode = 'in-memory (永続化失敗)'
      }
    }
  })()
  return { db, ready }
}

export function getPg(): DbHandle {
  if (!globalThis.__studioPg) globalThis.__studioPg = init()
  return globalThis.__studioPg
}

/**
 * PGlite を「クエリログ付き Proxy」でラップする。
 * supabase-mock / SQL コンソール / DB ブラウザのすべての query/exec が
 * 自動で Studio のクエリログに記録される。
 */
function wrapWithLog(db: PGlite): PGlite {
  const handler: ProxyHandler<PGlite> = {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver)
      if (prop === 'query' && typeof v === 'function') {
        return async function (this: unknown, sql: string, params?: unknown[]) {
          const t0 = Date.now()
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await (v as any).call(target, sql, params)
            pushQueryLog({
              sql, params,
              rowCount: Array.isArray(res?.rows) ? res.rows.length : undefined,
              ms: Date.now() - t0,
            })
            return res
          } catch (e) {
            pushQueryLog({
              sql, params,
              ms: Date.now() - t0,
              error: e instanceof Error ? e.message : String(e),
            })
            throw e
          }
        }
      }
      if (prop === 'exec' && typeof v === 'function') {
        return async function (this: unknown, sql: string) {
          const t0 = Date.now()
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await (v as any).call(target, sql)
            pushQueryLog({ sql, ms: Date.now() - t0, source: 'exec' })
            return res
          } catch (e) {
            pushQueryLog({
              sql, ms: Date.now() - t0,
              error: e instanceof Error ? e.message : String(e),
              source: 'exec',
            })
            throw e
          }
        }
      }
      return typeof v === 'function' ? v.bind(target) : v
    },
  }
  return new Proxy(db, handler)
}

export async function getReadyPg(): Promise<PGlite> {
  const h = getPg()
  await h.ready
  return wrapWithLog(h.db)
}
