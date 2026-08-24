import { NextResponse } from 'next/server'
import { getPg, queryAsUser } from '@/lib/sdk-mock/pg'

/**
 * SQL コンソール用: 任意 SQL を実行 (Studio dev のみ想定)
 * Body: { sql: string, params?: unknown[], asUserId?: string }
 *
 * asUserId を指定すると、そのユーザーとして authenticated ロールで実行する
 * （schema.sql の RLS ポリシーが実際に評価される。厳格モードの db_query 版）。
 * 省略時は従来どおり superuser 相当で実行（RLS は素通り）。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as
    { sql?: string; params?: unknown[]; asUserId?: string } | null
  if (!body || typeof body.sql !== 'string' || !body.sql.trim()) {
    return NextResponse.json({ error: 'sql is required' }, { status: 400 })
  }
  const t0 = Date.now()
  try {
    if (body.asUserId) {
      const res = await queryAsUser(body.sql, body.params, body.asUserId)
      return NextResponse.json({
        ok:      true,
        ms:      Date.now() - t0,
        rows:    res.rows,
        asUserId: body.asUserId,
      })
    }
    const { db, ready } = getPg()
    await ready
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
