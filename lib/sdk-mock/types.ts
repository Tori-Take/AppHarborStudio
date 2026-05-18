/**
 * モック SDK の型定義
 *
 * 契約 (型) の単一ソースは @appharbor/sdk (npm パッケージ)。
 * 本ファイルの OrgActor / AppContext / OrgRole は SDK 契約と shape を合わせる。
 *
 * 本ファイルから直接 @appharbor/sdk を import できない理由:
 *   Studio の webpack alias `@appharbor/sdk → ./lib/sdk-mock` が循環するため、
 *   このファイル内では @appharbor/sdk を import しない。
 *   SDK 側の型変更は本ファイルにも手動で反映する。
 *
 * 参照: node_modules/@appharbor/sdk/src/types.ts
 */

export type OrgRole = 'org-admin' | 'dept-admin' | 'member'

export type OrgActor = {
  id:             string
  email:          string
  actorName:      string
  organizationId: string
  orgSlug:        string
  orgRole:        OrgRole
  departmentId:   string | null
  managedDeptId:  string | null
}

export type AppContext = {
  actor: OrgActor
  appId: string
  role:  string
}

/** Studio が管理する仮ユーザー定義（テスト時にロール切替で使う） */
export type MockUser = {
  id:           string
  email:        string
  actorName:    string
  orgRole:      OrgRole
  departmentId: string | null
  /** アプリごとの個別ロール（appId → role 文字列） */
  appRoles:     Record<string, string>
}

/** Studio が管理する仮組織 */
export type MockOrg = {
  id:   string
  slug: string
  name: string
}

/** Studio が管理する仮部署（3 階層までの組織ツリー） */
export type MockDepartment = {
  id:       string
  name:     string
  parentId: string | null
}

/**
 * 通知（インフォ）入力。
 * sdk.notify() がカートリッジから受け取るペイロード。
 * source_app_id / organization_id / created_by はサーバー側で自動補完されるので
 * カートリッジ作者が渡す必要があるのは title / body / scope / target / link のみ。
 */
export type NotifyInput = {
  title:        string
  body?:        string
  link?:        string
  /** 'org': 組織全員に / 'dept': 指定部署のみ / 'user': 指定ユーザーのみ */
  scope?:       'org' | 'dept' | 'user'
  /** scope='dept' のとき必須。対象部署 ID。 */
  targetDeptId?: string | null
  /** scope='user' のとき必須。対象ユーザー ID。 */
  targetUserId?: string | null
  /** カートリッジ ID 上書き。通常は middleware の x-cartridge-id から自動。 */
  sourceAppId?: string
}

/**
 * お知らせ 1 行の Studio UI 用 shape。
 * 本番 AppHarbor の `announcements` テーブルとカラム名・型を揃えている
 * (camelCase 化のみ)。NotificationBell / API ルートが使う。
 */
export type AnnouncementRow = {
  id:              string
  title:           string
  body:            string
  target:          'all' | 'org'
  organizationId:  string | null
  /** scope='dept' 相当 (空配列なら全員向け) */
  departmentIds:   string[]
  /** scope='user' 相当 (空配列なら全員向け) */
  userIds:         string[]
  sourceAppId:     string | null
  link:            string | null
  publishedAt:     string
  createdBy:       string | null
  createdAt:       string
  /** 既読時刻 (notification_reads から join) */
  readAt:          string | null
}

/** @deprecated NotificationRow は AnnouncementRow に統一されました。本番 schema と揃えた名称を使ってください。 */
export type NotificationRow = AnnouncementRow
