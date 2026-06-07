import { NextResponse } from 'next/server'
import { existsSync, readFileSync, rmSync, lstatSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { resolveCartridgesPath } from '@/lib/config'
import { getCartridge } from '@/lib/cartridge-scanner'
import { getPg } from '@/lib/sdk-mock/pg'

/**
 * カートリッジを完全に削除する。
 *
 *  1. studio/app/org/[slug]/apps/<id>/ のマウント先フォルダを削除
 *  2. PGlite 上のこのカートリッジのテーブルを DROP
 *  3. junction (cartridges/_local/<id>) があれば削除
 *  4. ソースフォルダの実体 (sibling リポ or cartridges/<id>) を削除
 *
 * ⚠ Git 履歴には触らないが、コミット前の変更も含めてフォルダごと消える。
 * 「アプリ名/識別子をミスったので作り直したい」用途のユーザー操作。
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe || safe !== appId) {
    return NextResponse.json({ error: '不正な appId です' }, { status: 400 })
  }

  // scanner 経由でカートリッジの実体パスを取得 (junction も解決済み)
  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json({ error: 'カートリッジが見つかりません' }, { status: 404 })
  }

  const studioRoot     = process.cwd()
  const mountedDir     = join(studioRoot, 'app', 'org', '[slug]', 'apps', safe)
  const cartridgesRoot = resolveCartridgesPath()
  const junctionPath   = join(cartridgesRoot, '_local', safe)
  const cartDir        = entry.path  // junction 解決済みの実体パス
  const manifestPath   = join(cartDir, 'manifest.json')
  const schemaPath     = join(cartDir, 'db', 'schema.sql')

  if (!existsSync(cartDir)) {
    return NextResponse.json({ error: 'カートリッジの実体パスが見つかりません' }, { status: 404 })
  }

  // 1. PGlite のテーブルを先に DROP (cartDir 削除前に schema を読む必要あり)
  const droppedTables: string[] = []
  try {
    const handle = getPg()
    await handle.ready
    const { db } = handle

    let tables: string[] = []
    if (existsSync(manifestPath)) {
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        if (Array.isArray(m.tables)) tables = m.tables.filter((t: unknown) => typeof t === 'string')
      } catch { /* ignore */ }
    }
    if (tables.length === 0 && existsSync(schemaPath)) {
      const sql = readFileSync(schemaPath, 'utf-8')
        .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
      const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"?/gi
      const found = new Set<string>()
      let m: RegExpExecArray | null
      while ((m = re.exec(sql)) !== null) found.add(m[1])
      tables = [...found]
    }

    for (const t of tables) {
      if (!/^[a-zA-Z0-9_]+$/.test(t)) continue
      await db.exec(`DROP TABLE IF EXISTS ${t} CASCADE`)
      droppedTables.push(t)
    }
  } catch {
    /* DB エラーは無視 — カートリッジが PGlite を使っていない場合もある */
  }

  // 2. マウント先削除
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

  // 3. junction を削除 (実体ではなく junction エントリだけ)
  let junctionRemoved = false
  if (existsSync(junctionPath)) {
    try {
      const stat = lstatSync(junctionPath)
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        if (process.platform === 'win32') {
          // junction は rmdir で消す (rmSync recursive だと中身まで消える可能性あり)
          spawnSync('cmd', ['/c', 'rmdir', junctionPath], { encoding: 'utf-8' })
        } else {
          unlinkSync(junctionPath)
        }
        junctionRemoved = true
      }
    } catch (e) {
      // junction 削除失敗は致命的でないので警告だけ
      console.warn('junction 削除に失敗:', (e as Error).message)
    }
  }

  // 4. ソースフォルダ実体を削除
  try {
    rmSync(cartDir, { recursive: true, force: true })
  } catch (e) {
    return NextResponse.json(
      { error: `カートリッジ削除に失敗: ${(e as Error).message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    deletedPath: cartDir,
    junctionRemoved,
    mountedRemoved,
    droppedTables,
  })
}
