import { NextResponse } from 'next/server'
import { clearQueryLog, getQueryLog } from '@/lib/sdk-mock/query-log'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const since = url.searchParams.get('since') ?? undefined
  return NextResponse.json(getQueryLog(since))
}

export async function DELETE() {
  clearQueryLog()
  return NextResponse.json({ ok: true })
}
