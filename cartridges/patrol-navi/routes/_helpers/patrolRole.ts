// PatrolNavi の権限判定ヘルパ
//
// manifest permissions（v2.1.0 で簡略化）:
//   - viewer (default) : アプリへのアクセス。組織メンバー全員が既定で持つ。
//                        パトロール作成・自シート編集も含む。
//   - admin            : テンプレート管理・役割管理・組織内全シート操作。
//
// 「ワークフロー上のステップを誰がやるか」「現場責任者の解決」等の
// 業務操作権限は patrol_workflow_roles + patrol_workflow_role_bindings で
// 動的に解決する（v2.2.0+ で実装）。
//
// このヘルパは manifest permission の判定だけを提供する。

export type PatrolRole = 'viewer' | 'admin'

export const PATROL_ROLE_LABEL: Record<PatrolRole, string> = {
  viewer: '閲覧者',
  admin:  '管理者',
}

function asRole(role: string | null | undefined): PatrolRole | null {
  if (role === 'viewer' || role === 'admin') return role
  // 旧 v1 の 'patroller' は viewer に格下げ（後方互換）
  if (role === 'patroller') return 'viewer'
  return null
}

export function canViewPatrols(role: string | null | undefined): boolean {
  return asRole(role) !== null
}

export function canManageTemplates(role: string | null | undefined): boolean {
  return asRole(role) === 'admin'
}

export function isPatrolAdmin(role: string | null | undefined): boolean {
  return asRole(role) === 'admin'
}

import { requireActor, getAppRole } from '@/sdk'
import type { Actor as OrgActor } from '@/sdk'

/**
 * Server Action 用の admin ガード。
 *
 * org-role ではなく app-role (= patrol-navi 内のロール) で判定する。
 * これにより、「dept-admin に admin app-role を上書きで与える」等の
 * 柔軟な運用が可能になる。
 *
 * 戻り値は guard 型を維持するので、既存の
 *   const guard = await requireOrgAccess(slug, 'org-admin')
 *   if (!guard.ok) return { error: guard.error }
 * パターンをそのまま:
 *   const guard = await requirePatrolAdminAction(slug)
 *   if (!guard.ok) return { error: guard.error }
 * に置換できる。
 */
export async function requirePatrolAdminAction(
  slug: string,
): Promise<{ ok: true; actor: OrgActor } | { ok: false; error: string }> {
  const guard = await requireActor(slug, 'member')
  if (!guard.ok) return guard
  const role = await getAppRole({
    organizationId: guard.actor.organizationId,
    userId:         guard.actor.id,
    departmentId:   guard.actor.departmentId,
    appId:          'patrol-navi',
  })
  if (!canManageTemplates(role)) {
    return { ok: false, error: 'このアクションには管理者ロール (admin) が必要です' }
  }
  return { ok: true, actor: guard.actor }
}
