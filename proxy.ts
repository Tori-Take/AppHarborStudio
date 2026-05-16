import { NextResponse, type NextRequest } from 'next/server'

/**
 * Studio の Next.js proxy (旧 middleware)
 *
 * 役割:
 *   1. カートリッジ実行ルートと API ルートから appId を抽出
 *      → `x-cartridge-id` リクエストヘッダーに設定
 *      (supabase-mock.ts がこれを読んで DB ソース pglite/docker/studio-cloud を切替)
 *
 *   2. 親ディレクトリ (AppHarbor 本体) の proxy.ts を Studio が拾わないようにする
 *      ためのスタブも兼ねる。
 */
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  let appId: string | null = null

  // /org/[slug]/apps/[appId]/...
  let m = pathname.match(/^\/org\/[^/]+\/apps\/([^/]+)/)
  if (m) appId = decodeURIComponent(m[1])

  // /api/cartridges/[appId]/...
  if (!appId) {
    m = pathname.match(/^\/api\/cartridges\/([^/]+)/)
    if (m) appId = decodeURIComponent(m[1])
  }

  // /api/pg-query (ブラウザ → PGlite プロキシ)
  // → Referer から呼び出し元カートリッジを推定
  if (!appId && pathname === '/api/pg-query') {
    const referer = request.headers.get('referer')
    if (referer) {
      try {
        const refUrl = new URL(referer)
        const rm = refUrl.pathname.match(/^\/org\/[^/]+\/apps\/([^/]+)/)
        if (rm) appId = decodeURIComponent(rm[1])
      } catch { /* ignore invalid referer */ }
    }
  }

  if (!appId) return NextResponse.next({ request })

  console.log(`[proxy] ${pathname} → x-cartridge-id: ${appId}`)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-cartridge-id', appId)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
