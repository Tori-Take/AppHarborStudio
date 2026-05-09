import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout } from '../../patrol-layout'
import { canViewPatrols, isPatrolAdmin } from '../../_helpers/patrolRole'
import { NewPatrolClient } from './NewPatrolClient'

export default async function NewPatrolPage({
  params,
}: {
  params: Promise<{ slug: string; appId?: string }>
}) {
  const { slug } = await params

  const ctx = await requireApp(slug, 'patrol-navi', canViewPatrols)

  // ピッカー用に部署 + 現ユーザーの所属部署を取得
  const supabaseAdmin = getAdminSupabase()
  const [deptsRes, meRes, rolesRes, bindingsRes, profilesRes] = await Promise.all([
    supabaseAdmin
      .from('departments')
      .select('id, name, parent_id')
      .eq('organization_id', ctx.actor.organizationId)
      .is('deleted_at', null)
      .order('display_order'),
    supabaseAdmin
      .from('profiles')
      .select('department_id')
      .eq('id', ctx.actor.id)
      .single(),
    supabaseAdmin
      .from('patrol_workflow_roles')
      .select('id, key, label')
      .eq('organization_id', ctx.actor.organizationId)
      .is('deleted_at', null),
    supabaseAdmin
      .from('patrol_workflow_role_bindings')
      .select('role_id, user_id')
      .eq('organization_id', ctx.actor.organizationId),
    supabaseAdmin
      .from('profiles')
      .select('id, display_name, department_id, org_role')
      .eq('organization_id', ctx.actor.organizationId)
      .eq('status', 'active'),
  ])
  const departments = (deptsRes.data ?? []) as Array<{ id: string; name: string; parent_id: string | null }>
  const currentUserDeptId = (meRes.data as { department_id: string | null } | null)?.department_id ?? null

  // 役割ラベル → 既定担当者の display_name[] のマップを構築
  const roles = (rolesRes.data ?? []) as Array<{ id: string; key: string; label: string }>
  const bindings = (bindingsRes.data ?? []) as Array<{ role_id: string; user_id: string }>
  const deptNameMap = new Map(departments.map(d => [d.id, d.name]))
  const ORG_ROLE_LABEL: Record<string, string> = {
    'org-admin':  '組織管理者',
    'dept-admin': '部署管理者',
    'member':     '',
  }
  const profilesMap = new Map<string, string>()
  for (const p of (profilesRes.data ?? []) as Array<{ id: string; display_name: string; department_id: string | null; org_role: string | null }>) {
    // display_name の末尾にあるロール表記「（...）」を除去し、所属部署名 or 役職を付与
    const baseName = p.display_name.replace(/[（(][^（()]*[)）]\s*$/, '').trim()
    const deptName = p.department_id ? deptNameMap.get(p.department_id) : null
    const roleLabel = p.org_role ? ORG_ROLE_LABEL[p.org_role] : ''
    const suffix = deptName || roleLabel || ''
    profilesMap.set(p.id, suffix ? `${baseName}（${suffix}）` : baseName)
  }
  const roleMembersByLabel: Record<string, Array<{ id: string; display_name: string }>> = {}
  for (const role of roles) {
    const memberIds = bindings.filter(b => b.role_id === role.id).map(b => b.user_id)
    roleMembersByLabel[role.label] = memberIds
      .map(id => ({ id, display_name: profilesMap.get(id) ?? '' }))
      .filter(m => m.display_name)
  }

  return (
    <PatrolLayout isAdmin={isPatrolAdmin(ctx.role)}>
      <NewPatrolClient
        slug={slug}
        departments={departments}
        currentUserDeptId={currentUserDeptId}
        currentUserId={ctx.actor.id}
        roleMembersByLabel={roleMembersByLabel}
      />
    </PatrolLayout>
  )
}
