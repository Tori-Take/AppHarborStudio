import { NextResponse } from 'next/server'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { getPg } from '@/lib/sdk-mock/pg'
import { resolveCartridgesPath } from '@/lib/config'
import { PERM_FILE } from '@/lib/sdk-mock/app-permissions'
import { clearQueryLog } from '@/lib/sdk-mock/query-log'

/**
 * Studio クリーン起動 — 「rm -rf .studio-db」相当を再起動なしで実現する。
 *
 *  1. PGlite 内の全 user テーブルを DROP CASCADE
 *  2. db-base.sql 再適用 (組織 / 30 ユーザー / 10 部署を再シード)
 *  3. 全カートリッジ schema.sql を再適用
 *  4. .studio-db/app-permissions.json を削除
 *  5. クエリログをクリア
 *
 * PGlite ファイル本体 (.studio-db/pgdata) には触らない:
 *   Windows ではプロセスが掴んでいて削除失敗するため、テーブルレベルで初期化する。
 */
export async function POST() {
  const studioRoot = process.cwd()
  const baseSqlPath = join(studioRoot, 'lib', 'sdk-mock', 'db-base.sql')

  const handle = getPg()
  await handle.ready
  const { db } = handle

  const log: string[] = []

  // 1. すべての user テーブルを DROP
  try {
    await db.exec(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT schemaname, tablename
          FROM pg_tables
          WHERE schemaname IN ('public', 'auth', 'storage')
        LOOP
          EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', r.schemaname, r.tablename);
        END LOOP;
      END $$;
    `)
    log.push('✓ 全テーブルを DROP')
  } catch (e) {
    log.push(`✗ DROP 失敗: ${(e as Error).message}`)
  }

  // 2. ベーススキーマ再適用
  if (existsSync(baseSqlPath)) {
    try {
      await db.exec(readFileSync(baseSqlPath, 'utf-8'))
      log.push('✓ ベーススキーマ + 30 ユーザー再シード')
    } catch (e) {
      log.push(`✗ ベース再適用失敗: ${(e as Error).message}`)
    }
  }

  // 3. 各カートリッジ schema.sql を再適用
  const cartridgesRoot = resolveCartridgesPath()
  if (existsSync(cartridgesRoot)) {
    for (const name of readdirSync(cartridgesRoot)) {
      if (name.startsWith('_') || name.startsWith('.')) continue
      const dir = join(cartridgesRoot, name)
      if (!statSync(dir).isDirectory()) continue
      const schemaPath = join(dir, 'db', 'schema.sql')
      if (!existsSync(schemaPath)) continue
      try {
        await db.exec(readFileSync(schemaPath, 'utf-8'))
        log.push(`✓ ${name} schema 再適用`)
      } catch (e) {
        log.push(`⚠ ${name} schema 警告: ${(e as Error).message.slice(0, 80)}`)
      }
    }
  }

  // 4. app-permissions.json 削除
  if (existsSync(PERM_FILE)) {
    try {
      rmSync(PERM_FILE)
      log.push('✓ app-permissions.json 削除')
    } catch (e) {
      log.push(`✗ permissions 削除失敗: ${(e as Error).message}`)
    }
  }

  // 5. クエリログクリア
  clearQueryLog()
  log.push('✓ クエリログクリア')

  return NextResponse.json({ ok: true, log })
}
