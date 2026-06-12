/**
 * notify() — モック実装
 *
 * 本体 (lib/sdk/notify.ts) は announcements テーブルへ INSERT するが、
 * Studio では PGlite の notifications テーブルへ INSERT し、
 * Studio chrome のベル UI (PreviewNav の NotificationBell) が表示する。
 *
 * カートリッジの db-source (pglite / docker / studio-cloud) に関わらず、
 * 通知はプラットフォーム側の状態なので常に Studio の PGlite に保存する。
 *
 * source_app_id 解決順序（本体と同じ）:
 *   1. input.sourceAppId (明示指定)
 *   2. proxy.ts が設定した x-cartridge-id ヘッダー
 *   どちらも無ければエラー。
 */

import { headers } from 'next/headers'
import { getReadyPg } from './pg'
import { getCurrentMockUserServer, getMockOrgServer } from './server-context'
import type { NotifyInput, NotifyResult } from './types'

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  if (!input.title || !input.title.trim()) {
    throw new Error('notify(): title は必須です')
  }
  const scope = input.scope ?? 'org'
  if (scope === 'dept' && !input.targetDeptId) {
    throw new Error('notify(): scope="dept" のときは targetDeptId が必須です')
  }
  if (scope === 'user' && !input.targetUserId) {
    throw new Error('notify(): scope="user" のときは targetUserId が必須です')
  }

  let sourceAppId = input.sourceAppId
  if (!sourceAppId) {
    const h = await headers()
    sourceAppId = h.get('x-cartridge-id') ?? undefined
  }
  if (!sourceAppId) {
    throw new Error(
      'notify(): source_app_id を解決できません。' +
      'カートリッジ実行ルート (/org/[slug]/apps/[appId]/...) 外から呼ぶ場合は ' +
      'sourceAppId を明示指定してください',
    )
  }

  const user = await getCurrentMockUserServer()
  const org  = getMockOrgServer()

  const db  = await getReadyPg()
  const res = await db.query(
    `insert into notifications
       (source_app_id, organization_id, scope, target_dept_id, target_user_id,
        title, body, link, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [
      sourceAppId,
      org.id,
      scope,
      scope === 'dept' ? input.targetDeptId : null,
      scope === 'user' ? input.targetUserId : null,
      input.title.trim(),
      (input.body ?? '').trim(),
      input.link ?? null,
      user.id,
    ],
  )
  const row = (res.rows as Array<{ id: string }>)[0]
  if (!row?.id) {
    throw new Error('notify(): insert 失敗')
  }
  return { id: row.id }
}
