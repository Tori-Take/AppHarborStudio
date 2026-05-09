import { NextResponse } from 'next/server'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { getPg } from '@/lib/sdk-mock/pg'
import { resolveCartridgesPath } from '@/lib/config'

/**
 * サンプルマスターデータを各カートリッジから読み込む。
 *   各カートリッジの db/sample-data.sql を順番に exec する。
 *   ファイルは冪等 (UUID 固定 + ON CONFLICT DO NOTHING) を期待。
 *
 * 通常は「💣 完全リセット」直後に呼ばれる想定。
 * 単体でも呼べるので、テスト中に「またサンプル流したい」時にも使える。
 */
export async function POST() {
  const handle = getPg()
  await handle.ready
  const { db } = handle

  const cartridgesRoot = resolveCartridgesPath()
  const log: string[] = []
  let applied = 0

  if (existsSync(cartridgesRoot)) {
    for (const name of readdirSync(cartridgesRoot)) {
      if (name.startsWith('_') || name.startsWith('.')) continue
      const dir = join(cartridgesRoot, name)
      if (!statSync(dir).isDirectory()) continue
      const sampleSqlPath = join(dir, 'db', 'sample-data.sql')
      if (!existsSync(sampleSqlPath)) continue

      try {
        await db.exec(readFileSync(sampleSqlPath, 'utf-8'))
        applied++
        log.push(`✓ ${name} sample-data.sql`)
      } catch (e) {
        log.push(`⚠ ${name}: ${(e as Error).message.slice(0, 100)}`)
      }
    }
  }

  return NextResponse.json({ ok: true, applied, log })
}
