import { NextResponse } from 'next/server'
import { initAppPermissions } from '@/lib/sdk-mock/app-permissions'
import { DEFAULT_USERS } from '@/lib/sdk-mock/store'

/**
 * 「Studio で起動」時に呼び出される自動初期化エンドポイント。
 *   - 該当 appId のエントリが既にあれば no-op
 *   - 無ければ DEFAULT_USERS[0] (= 田中) に admin 相当ロールを付与して保存
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ appId: string }> },
) {
  const { appId } = await ctx.params
  const topUser = DEFAULT_USERS[0]
  const initialized = await initAppPermissions(appId, topUser.id)
  return NextResponse.json({ ok: true, initialized, topUserId: topUser.id })
}
