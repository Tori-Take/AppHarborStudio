import Link            from 'next/link'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout }  from '../../patrol-layout'
import { buttonVariants } from '../../_ui/button'
import { cn }            from '../../_ui/cn'
import { Plus, GitBranch, ArrowLeft } from 'lucide-react'
import { canManageTemplates } from '../../_helpers/patrolRole'
import { TemplateListRow } from '../TemplateListRow'

export default async function WorkflowsPage({
  params,
}: {
  params: Promise<{ slug: string; appId?: string }>
}) {
  const { slug } = await params

  const ctx = await requireApp(slug, 'patrol-navi', canManageTemplates)
  const orgId = ctx.actor.organizationId
  const supabaseAdmin = getAdminSupabase()

  // 注: 1:N 埋め込み select (patrol_workflow_steps(id)) は Studio の
  // supabase-mock では JOIN で展開されて親が重複表示される。
  // 別クエリで step 数を集計するパターンに変更（本物 Supabase でも動く）。
  const { data: templatesRaw } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .select('id, name, description, is_active, sort_order')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('sort_order')
  const templates = (templatesRaw ?? []) as Array<{ id: string; name: string; description: string | null; is_active: boolean; sort_order: number }>

  // step 数集計
  const stepCountByTemplate = new Map<string, number>()
  if (templates.length > 0) {
    const { data: stepRows } = await supabaseAdmin
      .from('patrol_workflow_steps')
      .select('template_id')
      .in('template_id', templates.map((t) => t.id))
    for (const row of (stepRows as Array<{ template_id: string }> | null) ?? []) {
      stepCountByTemplate.set(row.template_id, (stepCountByTemplate.get(row.template_id) ?? 0) + 1)
    }
  }

  const base = `/org/${slug}/apps/patrol-navi`

  return (
    <PatrolLayout isAdmin={true}>
      <div className="p-4 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href={`${base}/admin`}
              className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              管理メニュー
            </Link>
            <h1 className="text-2xl font-bold">ワークフロー管理</h1>
          </div>
          <Link
            href={`${base}/admin/workflows/new`}
            className={cn(buttonVariants())}
          >
            <Plus className="h-4 w-4" />
            新規作成
          </Link>
        </div>

        {!templates || templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
            <GitBranch className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">ワークフローテンプレートがありません</p>
            <Link
              href={`${base}/admin/workflows/new`}
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
            >
              最初のテンプレートを作成する
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => {
              const stepCount = stepCountByTemplate.get(t.id) ?? 0
              return (
                <TemplateListRow
                  key={t.id}
                  kind="workflow"
                  templateId={t.id}
                  slug={slug}
                  href={`${base}/admin/workflows/${t.id}`}
                  copyHrefBase={`${base}/admin/workflows`}
                  icon={<GitBranch className="h-4 w-4" />}
                  name={t.name}
                  description={t.description ?? `${stepCount}ステップ`}
                  isActive={t.is_active}
                />
              )
            })}
          </div>
        )}
      </div>
    </PatrolLayout>
  )
}
