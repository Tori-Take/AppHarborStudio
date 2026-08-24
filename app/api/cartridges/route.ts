import { NextResponse } from 'next/server'
import { scanCartridges } from '@/lib/cartridge-scanner'

/**
 * Studio が認識している全カートリッジの一覧を返す。
 * MCP の list_cartridges ツールが薄くラップして呼ぶ（元々ダッシュボードの
 * Server Component が scanCartridges() を直接呼んでいたため、HTTP 経由の口が無かった）。
 */
export async function GET() {
  const cartridges = scanCartridges().map((c) => ({
    id:        c.id,
    hasRoutes: c.hasRoutes,
    hasDb:     c.hasDb,
    manifest:  c.manifest,
    error:     c.error ?? null,
  }))
  return NextResponse.json({ cartridges })
}
