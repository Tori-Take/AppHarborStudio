import { NextResponse } from 'next/server'
import { getPg } from '@/lib/sdk-mock/pg'

/**
 * SQL コンソール用: 任意 SQL を実行 (Studio dev のみ想定)
 * Body: { sql: string, params?: unknown[] }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { sql?: string; params?: unknown[] } | null
  if (!body || typeof body.sql !== 'string' || !body.sql.trim()) {
    return NextResponse.json({ error: 'sql is required' }, { status: 400 })
  }
  const { db, ready } = getPg()
  await ready
  const t0 = Date.now()
  try {
    const res = await db.query(body.sql, body.params)
    return NextResponse.json({
      ok:     true,
      ms:     Date.now() - t0,
      rows:   res.rows,
      fields: res.fields ?? [],
    })
  } catch (e) {
    return NextResponse.json({
      ok:    false,
      ms:    Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 200 })  // SQL エラーは 200 で返してフロントで表示
  }
}
