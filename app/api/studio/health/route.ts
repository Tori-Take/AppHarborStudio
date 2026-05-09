import { NextResponse } from 'next/server'

/**
 * Studio 自身の生存確認エンドポイント。
 * 「🔁 Studio 再起動」ボタン押下後、クライアントが復活を確認するために使う。
 *
 * 200 を返すだけ。意味のあるヘルスチェックは特にしない (DB 未準備でも 200)。
 */
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() })
}
