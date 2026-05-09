import { notFound }    from 'next/navigation'
import Link            from 'next/link'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout }  from '../../../patrol-layout'
import { ArrowLeft }     from 'lucide-react'
import { WorkflowEditor } from './WorkflowEditor'
import { canManageTemplates } from '../../../_helpers/patrolRole'

// Next.js のキャッシュを無効化して必ず最新を取得
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function WorkflowTemplatePage({
  params,
}: {
  params: Promise<{ slug: string; templateId: string }>
}) {
  const { slug, templateId } = await params

  const ctx = await requireApp(slug, 'patrol-navi', canManageTemplates)
  const orgId = ctx.actor.organizationId
  const supabaseAdmin = getAdminSupabase()

  const isNew = templateId === 'new'

  const template = isNew ? null : await supabaseAdmin
    .from('patrol_workflow_templates')
    .select('*')
    .eq('id', templateId)
    .single()
    .then(r => r.data)

  if (!isNew && !template) notFound()

  const { data: steps } = isNew ? { data: [] } : await supabaseAdmin
    .from('patrol_workflow_steps')
    .select('*')
    .eq('template_id', templateId)
    .order('step_order')

  // v2.2.0: WorkflowEditor に渡す role 候補 + user 候補
  // v2.5+: 担当者ピッカー用に department も取得
  const [rolesRes, usersRes, deptsRes, meRes] = await Promise.all([
    supabaseAdmin
      .from('patrol_workflow_roles')
      .select('key, label')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('sort_order'),
    supabaseAdmin
      .from('profiles')
      .select('id, display_name, department_id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('display_name'),
    supabaseAdmin
      .from('departments')
      .select('id, name, parent_id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('display_order'),
    supabaseAdmin
      .from('profiles')
      .select('department_id')
      .eq('id', ctx.actor.id)
      .single(),
  ])

  return (
    <PatrolLayout isAdmin={true}>
      <div className="mx-auto max-w-3xl p-4 sm:p-8">
        <Link
          href={`/org/${slug}/apps/patrol-navi/admin/workflows`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          ワークフロー一覧
        </Link>

        <WorkflowEditor
          slug={slug}
          templateId={isNew ? null : templateId}
          initialTemplate={template}
          initialSteps={steps ?? []}
          workflowRoles={(rolesRes.data ?? []) as Array<{ key: string; label: string }>}
          orgUsers={(usersRes.data ?? []) as Array<{ id: string; display_name: string; department_id: string | null }>}
          departments={(deptsRes.data ?? []) as Array<{ id: string; name: string; parent_id: string | null }>}
          currentUserDeptId={(meRes.data as { department_id: string | null } | null)?.department_id ?? null}
          currentUserId={ctx.actor.id}
        />
      </div>
    </PatrolLayout>
  )
}
