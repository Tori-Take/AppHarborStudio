import { NextResponse, type NextRequest } from 'next/server'

/**
 * Studio 用の no-op proxy
 *
 * 存在意義: instrumentation.ts と同じく、Next.js は proxy.ts を探索する際に
 * 親ディレクトリまで遡って解決することがある。AppHarbor 本体の
 * <repo-root>/proxy.ts は Supabase SSR を使うが、Studio は独立サブプロジェクトで
 * @supabase/ssr を依存に含めていないためビルド失敗する。
 *
 * ここで何もしない proxy を置いて Next.js の探索を打ち切る。
 * Studio はカートリッジ開発用のローカルツールでルート保護も nonce CSP も不要。
 */
export function proxy(request: NextRequest) {
  return NextResponse.next({ request })
}

export const config = {
  // 全リクエストを通過させるだけ。matcher を限定する必要なし。
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
