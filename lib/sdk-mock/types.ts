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

/** 通知の配信スコープ（SDK 契約 NotifyScope と shape を合わせる） */
export type NotifyScope = 'org' | 'dept' | 'user'

/** notify() の入力（SDK 契約 NotifyInput と shape を合わせる） */
export interface NotifyInput {
  title:         string
  body?:         string
  link?:         string
  scope?:        NotifyScope
  targetDeptId?: string | null
  targetUserId?: string | null
  sourceAppId?:  string
}

/** notify() の戻り値（SDK 契約 NotifyResult と shape を合わせる） */
export interface NotifyResult {
  id: string
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
