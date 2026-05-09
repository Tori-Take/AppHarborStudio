import { NextResponse } from 'next/server'
import { getPg } from '@/lib/sdk-mock/pg'

/**
 * DB ブラウザ用: 全テーブル一覧 (auth / storage / public / 等を含む)
 * 行数は概算 (pg_class.reltuples)。空のテーブルは 0 表示。
 */
export async function GET() {
  const { db, ready } = getPg()
  await ready
  const res = await db.query<{
    schema: string
    name:   string
    rows:   number
  }>(`
    SELECT
      n.nspname              AS schema,
      c.relname              AS name,
      coalesce(c.reltuples, 0)::bigint AS rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY n.nspname, c.relname
  `)
  return NextResponse.json(res.rows)
}
