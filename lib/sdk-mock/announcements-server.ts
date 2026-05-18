/**
 * Studio UI 側からお知らせ一覧 / 既読を扱うヘルパー。
 *
 * カートリッジが使う公開 API (notify()) は index.ts にあり、
 * このファイルは Studio chrome (NotificationBell コンポーネント等) が経由する
 * Route Handler から呼ぶ。本番 AppHarbor の `announcements` テーブルと同じ
 * shape を読む (Studio mock もそれに合わせた)。
 */

import { getReadyPg } from './pg'
import { getCurrentMockUserServer, getMockOrgServer } from './server-context'
import type { AnnouncementRow } from './types'

type Row = {
  id:              string
  title:           string
  body:            string
  target:          string
  organization_id: string | null
  department_ids:  string[] | null
  user_ids:        string[] | null
  source_app_id:   string | null
  link:            string | null
  published_at:    string | Date
  created_by:      string | null
  created_at:      string | Date
  read_at:         string | Date | null
}

function toIso(v: string | Date | null): string | null {
  if (v === null) return null
  return v instanceof Date ? v.toISOString() : v
}

function rowToAnnouncement(r: Row): AnnouncementRow {
  return {
    id:             r.id,
    title:          r.title,
    body:           r.body,
    target:         (r.target as AnnouncementRow['target']),
    organizationId: r.organization_id,
    departmentIds:  r.department_ids ?? [],
    userIds:        r.user_ids ?? [],
    sourceAppId:    r.source_app_id,
    link:           r.link,
    publishedAt:    toIso(r.published_at) ?? '',
    createdBy:      r.created_by,
    createdAt:      toIso(r.created_at) ?? '',
    readAt:         toIso(r.read_at),
  }
}

/**
 * 現在のユーザー向けに表示すべきお知らせ一覧。
 *
 * 表示ルール (本番 AppHarbor の挙動と揃える):
 *   - 同じ組織
 *   - department_ids 空 かつ user_ids 空 → 全員向け
 *   - 自部署が department_ids に含まれる   → その部署
 *   - 自分が user_ids に含まれる            → その個人
 *   - 自分が created_by のものは除外 (※ P3 で追加。自分の broadcast が自分のベルに
 *     出る挙動を防ぐ。本番 layout.tsx と同期)
 *
 * 既読状態は announcement_reads で join して付与。
 */
export async function listAnnouncementsForCurrentUser(limit = 50): Promise<AnnouncementRow[]> {
  const user = await getCurrentMockUserServer()
  const org  = getMockOrgServer()
  const db   = await getReadyPg()

  const res = await db.query<Row>(
    `select
       a.id,
       a.title,
       a.body,
       a.target,
       a.organization_id,
       a.department_ids,
       a.user_ids,
       a.source_app_id,
       a.link,
       a.published_at,
       a.created_by,
       a.created_at,
       r.read_at
     from announcements a
     left join announcement_reads r
       on r.announcement_id = a.id and r.user_id = $1
     where a.organization_id = $2
       and a.created_by is distinct from $1
       and (
         (array_length(a.department_ids, 1) is null and array_length(a.user_ids, 1) is null)
         or $3::uuid = any(a.department_ids)
         or $1::uuid = any(a.user_ids)
       )
     order by a.published_at desc
     limit $4`,
    [user.id, org.id, user.departmentId, limit],
  )

  return res.rows.map(rowToAnnouncement)
}

/** 単一お知らせを「既読」にする */
export async function markAnnouncementRead(announcementId: string): Promise<void> {
  const user = await getCurrentMockUserServer()
  const db   = await getReadyPg()
  await db.query(
    `insert into announcement_reads (announcement_id, user_id)
     values ($1, $2)
     on conflict (announcement_id, user_id) do nothing`,
    [announcementId, user.id],
  )
}

/** 現在のユーザーが見える未読お知らせをすべて既読にする */
export async function markAllAnnouncementsRead(): Promise<void> {
  const user = await getCurrentMockUserServer()
  const org  = getMockOrgServer()
  const db   = await getReadyPg()
  await db.query(
    `insert into announcement_reads (announcement_id, user_id)
     select a.id, $1
     from announcements a
     left join announcement_reads r
       on r.announcement_id = a.id and r.user_id = $1
     where r.announcement_id is null
       and a.organization_id = $2
       and a.created_by is distinct from $1
       and (
         (array_length(a.department_ids, 1) is null and array_length(a.user_ids, 1) is null)
         or $3::uuid = any(a.department_ids)
         or $1::uuid = any(a.user_ids)
       )`,
    [user.id, org.id, user.departmentId],
  )
}
