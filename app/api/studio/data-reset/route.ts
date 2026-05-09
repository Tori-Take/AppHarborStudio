import { NextResponse } from 'next/server'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { getPg } from '@/lib/sdk-mock/pg'
import { resolveCartridgesPath } from '@/lib/config'
import { clearQueryLog } from '@/lib/sdk-mock/query-log'

/**
 * データのみリセット — テンプレート / 役割は温存し、
 * 各カートリッジの manifest.transactionalTables だけを DELETE する。
 *
 *   - シート / 是正 / コメント / ステップ履歴 → 消える
 *   - チェックリストテンプレ / ワークフロー / 役割 → 残る
 *
 * テスト中の繰り返し用。マスター作り直し不要なので速い。
 */
export async function POST() {
  const handle = getPg()
  await handle.ready
  const { db } = handle

  const cartridgesRoot = resolveCartridgesPath()
  const log: string[] = []
  let totalDeleted = 0

  if (existsSync(cartridgesRoot)) {
    for (const name of readdirSync(cartridgesRoot)) {
      if (name.startsWith('_') || name.startsWith('.')) continue
      const dir = join(cartridgesRoot, name)
      if (!statSync(dir).isDirectory()) continue
      const manifestPath = join(dir, 'manifest.json')
      if (!existsSync(manifestPath)) continue

      let txTables: string[] = []
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (Array.isArray(m.transactionalTables)) {
          txTables = m.transactionalTables.filter((t: unknown): t is string => typeof t === 'string')
        }
      } catch { /* ignore */ }
      if (txTables.length === 0) continue

      // manifest 記載の順序 (子→親) で DELETE
      for (const t of txTables) {
        if (!/^[a-zA-Z0-9_]+$/.test(t)) continue
        try {
          const res = await db.query(`DELETE FROM ${t}`)
          totalDeleted += res.affectedRows ?? 0
          log.push(`✓ ${name}.${t} (${res.affectedRows ?? 0} 行)`)
        } catch (e) {
          log.push(`⚠ ${name}.${t}: ${(e as Error).message.slice(0, 80)}`)
        }
      }
    }
  }

  clearQueryLog()
  return NextResponse.json({ ok: true, totalDeleted, log })
}
