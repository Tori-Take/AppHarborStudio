import { NextResponse } from 'next/server'
import { getCartridge } from '@/lib/cartridge-scanner'
import { getCartridgeGitInfo } from '@/lib/cartridge-git'

/**
 * カートリッジリポの現在の git 情報を返す。
 *
 * use-stage-status の markCompleted がこのエンドポイントを叩いて、
 * 完了マーク時の HEAD コミットをキャプチャする。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json({ error: 'cartridge not found' }, { status: 404 })
  }

  const info = getCartridgeGitInfo(entry.path)
  return NextResponse.json(info)
}
