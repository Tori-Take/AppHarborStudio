import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

/**
 * ?url= に指定した URL の QR コードを data URL で返す。
 * PreviewNav からスマホ接続パネル表示用に使われる。
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(url, { width: 220, margin: 2 })
    return NextResponse.json({ qrDataUrl })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'qr generation failed' },
      { status: 500 },
    )
  }
}
