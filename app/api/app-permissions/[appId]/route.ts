import { NextResponse } from 'next/server'
import { resetAppPermissions } from '@/lib/sdk-mock/app-permissions'

/** 指定アプリのロール上書きを全削除 (= 次回 init で田中=admin に戻る) */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ appId: string }> },
) {
  const { appId } = await ctx.params
  resetAppPermissions(appId)
  return NextResponse.json({ ok: true })
}
