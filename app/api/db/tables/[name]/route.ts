import { NextResponse } from 'next/server'
import { getPg } from '@/lib/sdk-mock/pg'

/**
 * 指定テーブルの行を取得。
 *   /api/db/tables/<schema.table>?limit=50&offset=0
 *   schema を省略すると public.<name> として扱う
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params
  const url = new URL(req.url)
  const limit  = Math.min(Math.max(Number(url.searchParams.get('limit')  ?? 50), 1), 500)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)

  const [schema, table] = name.includes('.')
    ? name.split('.', 2)
    : ['public', name]

  // ホワイトリストチェック (識別子は ASCII + _ のみ許可、SQL injection 防御)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    return NextResponse.json({ error: 'invalid identifier' }, { status: 400 })
  }

  const { db, ready } = getPg()
  await ready

  try {
    const countRes = await db.query<{ c: bigint }>(`SELECT count(*)::bigint AS c FROM ${schema}.${table}`)
    const total = Number(countRes.rows[0]?.c ?? 0)

    const rowsRes = await db.query(
      `SELECT * FROM ${schema}.${table} LIMIT ${limit} OFFSET ${offset}`,
    )

    return NextResponse.json({
      schema, table, total, limit, offset,
      // PGlite の Date 型などは JSON 化で文字列になる
      rows: rowsRes.rows,
      fields: rowsRes.fields ?? [],
    })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
