'use server'

import { revalidatePath }       from 'next/cache'
import { getAdminSupabase } from '@/sdk'
import { requirePatrolAdminAction as requireOrgAccess } from '../../_helpers/patrolRole'
import { SEED_ROLES }           from './seed'

/**
 * 組織にまだロールが 1 つも無ければ seed する。
 * 何度呼んでも安全（ON CONFLICT で重複は無視）。
 */
export async function ensureSeedRolesAction(slug: string) {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) throw new Error(guard.error)
  const supabase = getAdminSupabase()
  const orgId = guard.actor.organizationId

  const { data: existing } = await supabase
    .from('patrol_workflow_roles')
    .select('id')
    .eq('organization_id', orgId)
    .limit(1)
  if (existing && existing.length > 0) return { ok: true, seeded: false }

  const rows = SEED_ROLES.map((r) => ({ organization_id: orgId, ...r }))
  const { error } = await supabase.from('patrol_workflow_roles').insert(rows)
  if (error) throw new Error(error.message)
  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/roles`)
  return { ok: true, seeded: true }
}

export async function createRoleAction(slug: string, formData: FormData) {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) throw new Error(guard.error)
  const supabase = getAdminSupabase()
  const orgId = guard.actor.organizationId

  const key         = String(formData.get('key') ?? '').trim()
  const label       = String(formData.get('label') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null

  if (!key || !label) throw new Error('key と label は必須です')
  if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error('key は小文字英数とアンダースコアのみ')

  const { data: maxRow } = await supabase
    .from('patrol_workflow_roles')
    .select('sort_order')
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const maxSort = (maxRow as Array<{ sort_order: number }> | null)?.[0]?.sort_order ?? 0
  const nextSort = Number(maxSort) + 10

  const { error } = await supabase.from('patrol_workflow_roles').insert({
    organization_id: orgId,
    key,
    label,
    description,
    sort_order: nextSort,
    is_system: false,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/roles`)
}

export async function updateRoleAction(slug: string, roleId: string, formData: FormData) {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) throw new Error(guard.error)
  const supabase = getAdminSupabase()
  const orgId = guard.actor.organizationId

  const label       = String(formData.get('label') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  if (!label) throw new Error('label は必須です')

  // 組織境界の検証
  const { data: target } = await supabase
    .from('patrol_workflow_roles')
    .select('organization_id')
    .eq('id', roleId)
    .single()
  if (!target || target.organization_id !== orgId) throw new Error('対象ロールが見つかりません')

  const { error } = await supabase
    .from('patrol_workflow_roles')
    .update({ label, description })
    .eq('id', roleId)
  if (error) throw new Error(error.message)
  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/roles`)
}

export async function deleteRoleAction(slug: string, roleId: string) {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) throw new Error(guard.error)
  const supabase = getAdminSupabase()
  const orgId = guard.actor.organizationId

  const { data: target } = await supabase
    .from('patrol_workflow_roles')
    .select('organization_id, is_system')
    .eq('id', roleId)
    .single()
  if (!target || target.organization_id !== orgId) throw new Error('対象ロールが見つかりません')
  if (target.is_system) throw new Error('システムロールは削除できません')

  const { error } = await supabase
    .from('patrol_workflow_roles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', roleId)
  if (error) throw new Error(error.message)
  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/roles`)
}

export async function addBindingAction(slug: string, roleId: string, formData: FormData) {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) throw new Error(guard.error)
  const supabase = getAdminSupabase()
  const orgId = guard.actor.organizationId

  const userId = String(formData.get('user_id') ?? '').trim()
  if (!userId) throw new Error('ユーザーを選択してください')

  // 組織境界
  const { data: target } = await supabase
    .from('patrol_workflow_roles')
    .select('organization_id')
    .eq('id', roleId)
    .single()
  if (!target || target.organization_id !== orgId) throw new Error('対象ロールが見つかりません')

  const { error } = await supabase
    .from('patrol_workflow_role_bindings')
    .insert({ organization_id: orgId, role_id: roleId, user_id: userId })
  if (error && !/duplicate key|unique constraint/.test(error.message)) {
    throw new Error(error.message)
  }
  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/roles`)
}

export async function removeBindingAction(slug: string, bindingId: string) {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) throw new Error(guard.error)
  const supabase = getAdminSupabase()
  const orgId = guard.actor.organizationId

  const { data: target } = await supabase
    .from('patrol_workflow_role_bindings')
    .select('organization_id')
    .eq('id', bindingId)
    .single()
  if (!target || target.organization_id !== orgId) throw new Error('対象が見つかりません')

  const { error } = await supabase
    .from('patrol_workflow_role_bindings')
    .delete()
    .eq('id', bindingId)
  if (error) throw new Error(error.message)
  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/roles`)
}
