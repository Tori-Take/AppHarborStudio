/**
 * モック SDK
 *
 * AppHarbor 本体 (@/sdk) と同じ shape の関数を、Studio 内のメモリ状態から返す。
 * カートリッジコードは一切変えずにそのまま動作する想定。
 *
 * 注意: lib/sdk-mock の中では `@appharbor/sdk` から import しない。
 * Studio の webpack alias が `@appharbor/sdk → ./lib/sdk-mock` となっているため、
 * このファイル内で `@appharbor/sdk` を import すると循環参照になる。
 * 代わりに、型は ./types でローカル定義し、SDK 契約と shape を合わせる責務を負う。
 *
 * 注意: Phase 1 ではメモリ状態のみ。DB（Supabase）モックは Phase 2 で対応。
 */

import { getCurrentMockUserServer, getMockOrgServer } from './server-context'
import { getOverrideRole, getManifestDefaultRole } from './app-permissions'
import type { AppContext, OrgActor, OrgRole } from './types'

export type { OrgActor, OrgActor as Actor, AppContext } from './types'
export type { OrgRole, MockUser, MockOrg } from './types'

// 通知（本体 lib/sdk/notify.ts と同じ契約。Studio は PGlite の notifications へ保存）
export { notify } from './notify'
export type { NotifyInput, NotifyResult, NotifyScope } from './types'

const synthesizeActor = async (): Promise<OrgActor> => {
  const u = await getCurrentMockUserServer()
  const o = getMockOrgServer()
  return {
    id:             u.id,
    email:          u.email,
    actorName:      u.actorName,
    organizationId: o.id,
    orgSlug:        o.slug,
    orgRole:        u.orgRole,
    departmentId:   u.departmentId,
    managedDeptId:  u.orgRole === 'dept-admin' ? u.departmentId : null,
  }
}

const ROLE_RANK: Record<OrgRole, number> = {
  'member':     1,
  'dept-admin': 2,
  'org-admin':  3,
}

/**
 * 組織アクセス権チェック（モック版）
 * - slug は Studio の sandbox 組織 slug と一致するかだけ確認
 * - 役割の最低条件を minRole で指定可能
 */
export async function requireActor(
  slug:    string,
  minRole: OrgRole = 'member',
): Promise<
  | { ok: true;  actor: OrgActor }
  | { ok: false; error: string }
> {
  const actor = await synthesizeActor()
  if (actor.orgSlug !== slug) {
    return { ok: false, error: 'この組織にアクセスする権限がありません（mock）' }
  }
  if (ROLE_RANK[actor.orgRole] < ROLE_RANK[minRole]) {
    return { ok: false, error: 'このアクションを実行する権限がありません（mock）' }
  }
  return { ok: true, actor }
}

/**
 * Platform Admin チェック（モック版）— Studio 上では常に成功扱い
 */
export async function requirePlatformAdmin() {
  const u = await getCurrentMockUserServer()
  return {
    ok: true as const,
    actor: { id: u.id, email: u.email, platformRole: 'platform-admin' as const },
  }
}

/**
 * アプリごとのロール解決（モック版）
 *
 * 解決順序:
 *   1. .studio-db/app-permissions.json の override を返す
 *   2. (互換) zustand store の appRoles[appId] (まだ使うコードが残っていた場合用)
 *   3. manifest.permissions[default=true].id (カートリッジ作者の宣言した既定ロール)
 *   4. 'member' (最終フォールバック・通常ここに来ない)
 *
 * 注意: 旧仕様の「org-admin → admin 自動昇格」は廃止。代わりに PlayButton が
 * 起動時に「先頭ユーザーに admin」を file 経由で付与する。
 */
export async function getAppRole(args: {
  organizationId: string
  userId:         string
  departmentId:   string | null
  appId:          string
}): Promise<string | null> {
  const u = await getCurrentMockUserServer()
  if (u.id !== args.userId) return null
  const override = await getOverrideRole(args.appId, args.userId)
  if (override) return override
  if (u.appRoles[args.appId]) return u.appRoles[args.appId]
  return getManifestDefaultRole(args.appId) ?? 'member'
}

// 権限エラーの構造化 payload は別モジュール（client から safe に import 可能）
import { buildStudioPermErrorMessage, type StudioPermErrorPayload } from './perm-error'
export { isStudioPermError, type StudioPermErrorPayload } from './perm-error'

function throwPermError(payload: StudioPermErrorPayload): never {
  throw new Error(buildStudioPermErrorMessage(payload))
}

/**
 * アプリ用ガード（モック版）
 */
export async function requireApp(
  slug:   string,
  appId:  string,
  check?: (role: string | null) => boolean,
): Promise<AppContext> {
  const u = await getCurrentMockUserServer()
  const guard = await requireActor(slug, 'member')
  if (!guard.ok) {
    throwPermError({
      kind:     'org-access',
      appId,
      userId:   u.id,
      userName: u.actorName,
      orgRole:  u.orgRole,
      appRole:  null,
      hint:     guard.error,
    })
  }
  const { actor } = guard
  const role = await getAppRole({
    organizationId: actor.organizationId,
    userId:         actor.id,
    departmentId:   actor.departmentId,
    appId,
  })
  if (role === null) {
    throwPermError({
      kind:     'role-missing',
      appId,
      userId:   u.id,
      userName: u.actorName,
      orgRole:  u.orgRole,
      appRole:  null,
      hint:     'このユーザーには appRole が解決できません',
    })
  }
  if (check && !check(role)) {
    throwPermError({
      kind:     'role-check-failed',
      appId,
      userId:   u.id,
      userName: u.actorName,
      orgRole:  u.orgRole,
      appRole:  role,
      hint:     `このページは現在のロール「${role}」ではアクセスできません`,
    })
  }
  return { actor, appId, role: role! }
}

/**
 * dept-admin 管轄スコープ（モック版）— Phase 1 では空配列返し
 */
export async function getActorScope(): Promise<{ deptIds: string[] }> {
  return { deptIds: [] }
}

export function isPathInScope(): boolean {
  return true
}

/**
 * Supabase クライアント（モック版）
 * Phase 2 minimum: in-memory のみ。dev サーバー再起動で消える。
 */
import { getLazySupabaseClient } from './supabase-lazy'

/**
 * カートリッジから呼ぶ Supabase クライアント。
 *
 * 戻り値は遅延解決プロキシ:
 *   - 同期で「Supabase 風オブジェクト」を返す (既存カートリッジ API 互換)
 *   - 実際の DB アクセスは await 時に発生し、リクエストの x-cartridge-id ヘッダーを見て
 *     `lib/sdk-mock/db-source.ts` の設定 (pglite / docker / studio-cloud) を解決する
 *
 * 使用例:
 *   const supabase = getAdminSupabase()
 *   const { data } = await supabase.from('xxx').select('*').eq('a', 1)
 *   const { data } = await supabase.storage.from('bucket').upload(file, ...)
 *
 * カートリッジコードは一切変更不要 (lazy proxy が透過的に切替)。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAdminSupabase(): any {
  return getLazySupabaseClient()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServerSupabase(): any {
  return getLazySupabaseClient()
}
