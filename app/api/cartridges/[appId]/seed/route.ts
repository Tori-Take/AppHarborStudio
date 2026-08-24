import { NextResponse } from 'next/server'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'
import { getPg } from '@/lib/sdk-mock/pg'

/**
 * カートリッジの db/seed/<scenario>.sql を仮DBに投入する。
 *
 * カートリッジ作成工程の再設計 Step 2（db/seed/ を標準装備にする）を先取りする形の
 * 薄い実行口。Step 2 が未着手のカートリッジでは単に該当ファイルが無いだけなので、
 * その場合は 404 で「無い」ことを明確に返す（クラッシュさせない）。
 *
 * Body: { scenario: string }  例: "typical" → db/seed/typical.sql
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json({ ok: false, error: `cartridge ${safe} not found` }, { status: 404 })
  }

  let body: { scenario?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const scenario = typeof body.scenario === 'string' ? body.scenario : ''
  // ファイル名として安全な文字のみ許可（パストラバーサル対策）
  if (!/^[a-zA-Z0-9_-]+$/.test(scenario)) {
    return NextResponse.json(
      { ok: false, error: 'scenario は英数字・ハイフン・アンダースコアのみ（例: "typical"）' },
      { status: 400 },
    )
  }

  const seedDir = join(entry.path, 'db', 'seed')
  const seedPath = join(seedDir, `${scenario}.sql`)
  if (!existsSync(seedPath)) {
    const available = existsSync(seedDir)
      ? readdirSync(seedDir).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, ''))
      : []
    return NextResponse.json(
      {
        ok: false,
        error: `db/seed/${scenario}.sql が見つかりません`,
        available,
      },
      { status: 404 },
    )
  }

  const sql = readFileSync(seedPath, 'utf-8')
  const { db, ready } = getPg()
  await ready
  const t0 = Date.now()
  try {
    await db.exec(sql)
    return NextResponse.json({ ok: true, scenario, ms: Date.now() - t0 })
  } catch (e) {
    return NextResponse.json({
      ok:    false,
      scenario,
      ms:    Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
