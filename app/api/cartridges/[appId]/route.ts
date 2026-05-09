import { NextResponse } from 'next/server'
import { getCartridge } from '@/lib/cartridge-scanner'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const c = getCartridge(decodeURIComponent(appId))
  if (!c || !c.manifest) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json(c.manifest)
}
