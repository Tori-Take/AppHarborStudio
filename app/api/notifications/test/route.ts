import { NextResponse } from 'next/server'
import { notify } from '@/lib/sdk-mock'

/**
 * 動作確認用のテスト発火エンドポイント。
 * NotificationBell から「テスト通知を出す」ボタンで呼ばれる想定。
 *
 * 通常のカートリッジ実行ルート (/org/.../apps/.../) 外から POST されると
 * x-cartridge-id ヘッダーが無いので sourceAppId を明示渡しする必要がある。
 * → リクエスト body の appId、または X-Cartridge-Id ヘッダーから受け取る。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const appId =
    (typeof body?.appId === 'string' ? body.appId : null) ??
    req.headers.get('x-cartridge-id') ??
    'studio-test'

  const result = await notify({
    sourceAppId:  appId,
    title:        typeof body?.title === 'string' ? body.title : 'テスト通知',
    body:         typeof body?.body  === 'string' ? body.body  : `${new Date().toLocaleTimeString('ja-JP')} に発火したテスト通知です。`,
    scope:        'org',
    link:         typeof body?.link  === 'string' ? body.link  : undefined,
  })

  return NextResponse.json({ ok: true, id: result.id })
}
