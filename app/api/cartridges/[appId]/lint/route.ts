import { NextResponse } from 'next/server'
import { getCartridge } from '@/lib/cartridge-scanner'
import { lintCartridge } from '@/lib/cartridge-lint'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const c = getCartridge(decodeURIComponent(appId))
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const result = lintCartridge(c.path)
  return NextResponse.json(result)
}
