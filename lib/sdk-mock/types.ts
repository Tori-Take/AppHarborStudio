/**
 * モック SDK の型定義
 *
 * AppHarbor 本体 (lib/sdk/) と同じ shape を維持すること。
 * 本体の型変更時は scripts/sync-types.js で同期するか、本ファイルを直接更新する。
 *
 * 同期対象（本体側パス）:
 *   - lib/auth/requireOrgAccess.ts → OrgActor
 *   - lib/sdk/requireApp.ts        → AppContext
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
