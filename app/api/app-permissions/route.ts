import { NextResponse } from 'next/server'
import { getAllPermissions, setOverrideRole } from '@/lib/sdk-mock/app-permissions'

export async function GET() {
  return NextResponse.json(getAllPermissions())
}

/**
 * Body: { appId: string, userId: string, role: string | null }
 * role を null / 空文字で送ると上書きを削除（= manifest.default に戻す）。
 */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.appId !== 'string' || typeof body.userId !== 'string') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const role = typeof body.role === 'string' && body.role !== '' ? body.role : null
  setOverrideRole(body.appId, body.userId, role)
  return NextResponse.json({ ok: true })
}
