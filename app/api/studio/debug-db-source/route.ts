import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { resolveCurrentDbSource, getCurrentCartridgeId, getDbSourceFor } from '@/lib/sdk-mock/db-source'

/**
 * DB ソース解決のデバッグ情報を返す。
 * /api/studio/debug-db-source?appId=vehicle-equipment で
 * 指定 appId の DB ソースを確認可能。
 *
 * /org/...apps/...内で呼べばヘッダー経由の解決も確認できる。
 */
export async function GET(req: Request) {
  const h = await headers()
  const url = new URL(req.url)
  const explicitAppId = url.searchParams.get('appId')

  const headerAppId = h.get('x-cartridge-id')
  const referer = h.get('referer')

  const currentAppId = await getCurrentCartridgeId()
  const currentSource = await resolveCurrentDbSource()
  const explicitSource = explicitAppId ? getDbSourceFor(explicitAppId) : null

  return NextResponse.json({
    headers: {
      'x-cartridge-id': headerAppId,
      'referer': referer,
    },
    resolved: {
      currentAppId,
      currentSource,
    },
    explicit: explicitAppId ? {
      appId: explicitAppId,
      source: explicitSource,
    } : null,
    env: {
      VERCEL: !!process.env.VERCEL,
      DOCKER_SUPABASE_URL: process.env.DOCKER_SUPABASE_URL ?? '(default)',
    },
  })
}
