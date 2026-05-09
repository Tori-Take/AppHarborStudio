import { NextResponse } from 'next/server'
import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { resolveCartridgesPath } from '@/lib/config'
import { getPg } from '@/lib/sdk-mock/pg'

/**
 * カートリッジを Step 1 の状態にリセットする。
 *
 *  1. studio/app/org/[slug]/apps/<id>/ のマウント先フォルダを削除
 *     → 次回プレイ起動時に最新ソースから再マウント
 *  2. PGlite 上のこのカートリッジのテーブルを DROP & 再作成
 *     → スコア等のデータがクリーンに
 *
 * ソース（cartridges/<id>/）と Git 履歴は触らない。
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const studioRoot = process.cwd()
  const mountedDir = join(studioRoot, 'app', 'org', '[slug]', 'apps', safe)

  // 1. マウント先フォルダ削除
  let mountedRemoved = false
  if (existsSync(mountedDir)) {
    try {
      rmSync(mountedDir, { recursive: true, force: true })
      mountedRemoved = true
    } catch (e) {
      return NextResponse.json(
        { error: `マウント先削除に失敗: ${(e as Error).message}` },
        { status: 500 },
      )
    }
  }

  // 2. PGlite のテーブルを DROP → schema.sql 再適用
  const cartridgesRoot = resolveCartridgesPath()
  const cartDir        = join(cartridgesRoot, safe)
  const manifestPath   = join(cartDir, 'manifest.json')
  const schemaPath     = join(cartDir, 'db', 'schema.sql')

  let droppedTables: string[] = []
  let schemaReapplied = false
  let dbError: string | null = null

  try {
    const handle = getPg()
    await handle.ready
    const { db } = handle

    // manifest.tables からテーブル名を取得
    let tables: string[] = []
    if (existsSync(manifestPath)) {
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (Array.isArray(m.tables)) tables = m.tables.filter((t: unknown) => typeof t === 'string')
      } catch { /* ignore */ }
    }
    // manifest.tables が空なら schema.sql から推測
    if (tables.length === 0 && existsSync(schemaPath)) {
      const sql = readFileSync(schemaPath, 'utf-8')
        .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
      const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"?/gi
      const found = new Set<string>()
      let m: RegExpExecArray | null
      while ((m = re.exec(sql)) !== null) found.add(m[1])
      tables = [...found]
    }

    // DROP TABLE IF EXISTS（CASCADE で依存も一緒に）
    for (const t of tables) {
      if (!/^[a-zA-Z0-9_]+$/.test(t)) continue
      await db.exec(`DROP TABLE IF EXISTS ${t} CASCADE`)
      droppedTables.push(t)
    }

    // schema.sql を再適用（空テーブルとして再作成）
    if (existsSync(schemaPath)) {
      const sql = readFileSync(schemaPath, 'utf-8')
      try {
        await db.exec(sql)
        schemaReapplied = true
      } catch (e) {
        dbError = `schema 再適用警告: ${(e as Error).message}`
      }
    }
  } catch (e) {
    dbError = `DB アクセス失敗: ${(e as Error).message}`
  }

  return NextResponse.json({
    ok: true,
    mountedRemoved,
    droppedTables,
    schemaReapplied,
    dbError,
  })
}
