import { NextResponse } from 'next/server'
import { getReadyPg } from '@/lib/sdk-mock/pg'
import { getCurrentMockUserServer, getMockOrgServer } from '@/lib/sdk-mock/server-context'

/**
 * Studio chrome のベル UI 用 API。
 *
 * GET  : 現在のモックユーザーに見える通知一覧（org 全体 / 自部署宛 / 自分宛）+ 未読数
 * POST : 現在見えている通知をすべて既読にする
 *
 * 「現在のユーザー」は sdk-mock と同じ Cookie (studio_user_id) で解決するので、
 * RoleSwitcher でユーザーを切り替えると見える通知・既読状態も切り替わる。
 */

/** 現在ユーザーに見える通知の WHERE 句（$1=userId, $2=orgId, $3=deptId） */
const VISIBLE_WHERE = `
  n.organization_id = $2
  and (n.scope = 'org'
    or (n.scope = 'dept' and n.target_dept_id = $3)
    or (n.scope = 'user' and n.target_user_id = $1))
`

export async function GET() {
  const user = await getCurrentMockUserServer()
  const org  = getMockOrgServer()
  const db   = await getReadyPg()

  const res = await db.query(
    `select n.id, n.source_app_id, n.scope, n.title, n.body, n.link,
            n.created_by, n.created_at, r.read_at
       from notifications n
       left join notification_reads r
         on r.notification_id = n.id and r.user_id = $1
      where ${VISIBLE_WHERE}
      order by n.created_at desc
      limit 50`,
    [user.id, org.id, user.departmentId],
  )

  type Row = {
    id: string; source_app_id: string; scope: string
    title: string; body: string; link: string | null
    created_by: string | null; created_at: string; read_at: string | null
  }
  const rows = res.rows as Row[]
  const notifications = rows.map((r) => ({
    id:          r.id,
    sourceAppId: r.source_app_id,
    scope:       r.scope,
    title:       r.title,
    body:        r.body,
    link:        r.link,
    createdBy:   r.created_by,
    createdAt:   r.created_at,
    readAt:      r.read_at,
  }))

  return NextResponse.json({
    notifications,
    unreadCount: notifications.filter((n) => !n.readAt).length,
  })
}

export async function POST() {
  const user = await getCurrentMockUserServer()
  const org  = getMockOrgServer()
  const db   = await getReadyPg()

  await db.query(
    `insert into notification_reads (notification_id, user_id)
     select n.id, $1 from notifications n
      where ${VISIBLE_WHERE}
     on conflict do nothing`,
    [user.id, org.id, user.departmentId],
  )

  return NextResponse.json({ ok: true })
}
