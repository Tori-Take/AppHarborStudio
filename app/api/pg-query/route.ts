/**
 * PGlite クエリプロキシ
 *
 * Studio 内のクライアントコンポーネント (`createBrowserSupabase()`)
 * がここに JSON で「QueryBuilder スペック」を POST する。
 * サーバ側で `getSupabaseMock()` を再構築して実行し、結果を返す。
 *
 * Security note:
 *   Studio はローカル開発環境専用 (PGlite はサンドボックス DB)。
 *   本物の Supabase / 本番 DB には接続しないため、SQL injection の
 *   懸念はあるが、攻撃面は localhost に閉じている。
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseMock } from '@/lib/sdk-mock/supabase-mock'

type FilterSpec =
  | { kind: 'eq';    col: string; val: unknown }
  | { kind: 'neq';   col: string; val: unknown }
  | { kind: 'in';    col: string; vals: unknown[] }
  | { kind: 'is';    col: string; val: null | boolean }
  | { kind: 'gt';    col: string; val: unknown }
  | { kind: 'gte';   col: string; val: unknown }
  | { kind: 'lt';    col: string; val: unknown }
  | { kind: 'lte';   col: string; val: unknown }
  | { kind: 'like';  col: string; val: string }
  | { kind: 'ilike'; col: string; val: string }
  | { kind: 'not';   col: string; op: 'is' | 'eq' | 'in'; val: unknown }

type QuerySpec = {
  table:    string
  op:       'select' | 'insert' | 'update' | 'delete' | 'upsert'
  columns?: string
  payload?: unknown
  filters?: FilterSpec[]
  orderBy?: { column: string; ascending?: boolean }
  limit?:   number
  opts?:    { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }
  upsert?:  { onConflict?: string }
  // terminator: 'thenable' | 'single' | 'maybeSingle'
  terminator?: 'thenable' | 'single' | 'maybeSingle'
}

type AuthSpec = { kind: 'getUser' }

type RpcRequest =
  | { type: 'query'; query: QuerySpec }
  | { type: 'auth';  auth:  AuthSpec }

export async function POST(req: NextRequest) {
  let body: RpcRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: { message: 'invalid JSON' } }, { status: 400 })
  }

  const sb = getSupabaseMock()

  if (body.type === 'auth') {
    if (body.auth.kind === 'getUser') {
      const r = await sb.auth.getUser()
      return NextResponse.json(r)
    }
    return NextResponse.json({ data: null, error: { message: 'unknown auth op' } }, { status: 400 })
  }

  if (body.type !== 'query') {
    return NextResponse.json({ data: null, error: { message: 'unknown rpc type' } }, { status: 400 })
  }

  const q = body.query
  type AnyBuilder = {
    select:  (cols?: string, opts?: QuerySpec['opts']) => AnyBuilder
    insert:  (row: unknown) => AnyBuilder
    update:  (row: unknown) => AnyBuilder
    upsert:  (row: unknown, opts?: { onConflict?: string }) => AnyBuilder
    delete:  () => AnyBuilder
    eq:      (col: string, val: unknown) => AnyBuilder
    neq:     (col: string, val: unknown) => AnyBuilder
    in:      (col: string, vals: unknown[]) => AnyBuilder
    is:      (col: string, val: null | boolean) => AnyBuilder
    gt:      (col: string, val: unknown) => AnyBuilder
    gte:     (col: string, val: unknown) => AnyBuilder
    lt:      (col: string, val: unknown) => AnyBuilder
    lte:     (col: string, val: unknown) => AnyBuilder
    like:    (col: string, val: string) => AnyBuilder
    ilike:   (col: string, val: string) => AnyBuilder
    not:     (col: string, op: 'is' | 'eq' | 'in', val: unknown) => AnyBuilder
    order:   (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => AnyBuilder
    limit:   (n: number) => AnyBuilder
    single:  () => Promise<unknown>
    maybeSingle: () => Promise<unknown>
    then:    (onfulfilled: (v: unknown) => unknown) => Promise<unknown>
  }
  let qb = sb.from(q.table) as unknown as AnyBuilder
  switch (q.op) {
    case 'select':
      qb = qb.select(q.columns, q.opts)
      break
    case 'insert':
      qb = qb.insert(q.payload as Record<string, unknown> | Record<string, unknown>[])
      if (q.columns) qb = qb.select(q.columns)
      break
    case 'update':
      qb = qb.update(q.payload as Record<string, unknown>)
      if (q.columns) qb = qb.select(q.columns)
      break
    case 'upsert':
      qb = qb.upsert(q.payload as Record<string, unknown> | Record<string, unknown>[], q.upsert)
      if (q.columns) qb = qb.select(q.columns)
      break
    case 'delete':
      qb = qb.delete()
      break
  }

  for (const f of q.filters ?? []) {
    switch (f.kind) {
      case 'eq':    qb = qb.eq(f.col, f.val); break
      case 'neq':   qb = qb.neq(f.col, f.val); break
      case 'in':    qb = qb.in(f.col, f.vals); break
      case 'is':    qb = qb.is(f.col, f.val); break
      case 'gt':    qb = qb.gt(f.col, f.val); break
      case 'gte':   qb = qb.gte(f.col, f.val); break
      case 'lt':    qb = qb.lt(f.col, f.val); break
      case 'lte':   qb = qb.lte(f.col, f.val); break
      case 'like':  qb = qb.like(f.col, f.val); break
      case 'ilike': qb = qb.ilike(f.col, f.val); break
      case 'not':   qb = qb.not(f.col, f.op, f.val); break
    }
  }

  if (q.orderBy) qb = qb.order(q.orderBy.column, { ascending: q.orderBy.ascending })
  if (typeof q.limit === 'number') qb = qb.limit(q.limit)

  if (q.terminator === 'single')      return NextResponse.json(await qb.single())
  if (q.terminator === 'maybeSingle') return NextResponse.json(await qb.maybeSingle())
  return NextResponse.json(await qb.then((v) => v))
}
