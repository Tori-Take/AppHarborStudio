import Link            from 'next/link'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout }  from '../../patrol-layout'
import { buttonVariants } from '../../_ui/button'
import { cn }            from '../../_ui/cn'
import { Plus, ClipboardList, ArrowLeft } from 'lucide-react'
import { canManageTemplates } from '../../_helpers/patrolRole'
import { TemplateListRow } from '../TemplateListRow'
import { ImportChecklistButton } from './ImportChecklistButton'

export default async function ChecklistsPage({
  params,
}: {
  params: Promise<{ slug: string; appId?: string }>
}) {
  const { slug } = await params

  const ctx = await requireApp(slug, 'patrol-navi', canManageTemplates)
  const orgId = ctx.actor.organizationId
  const supabaseAdmin = getAdminSupabase()

  const { data: templates } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('id, name, description, is_active, sort_order, version')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('sort_order')

  const base = `/org/${slug}/apps/patrol-navi`

  return (
    <PatrolLayout isAdmin={true}>
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href={`${base}/admin`}
              className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              管理メニュー
            </Link>
            <h1 className="text-2xl font-bold">チェックリスト管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <ImportChecklistButton slug={slug} />
            <Link
              href={`${base}/admin/checklists/new`}
              className={cn(buttonVariants())}
            >
              <Plus className="h-4 w-4" />
              新規作成
            </Link>
          </div>
        </div>

        {!templates || templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
            <ClipboardList className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">チェックリストテンプレートがありません</p>
            <Link
              href={`${base}/admin/checklists/new`}
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
            >
              最初のテンプレートを作成する
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <TemplateListRow
                key={t.id}
                kind="checklist"
                templateId={t.id as string}
                slug={slug}
                href={`${base}/admin/checklists/${t.id}`}
                copyHrefBase={`${base}/admin/checklists`}
                icon={<ClipboardList className="h-4 w-4" />}
                name={t.name as string}
                description={(t.description as string | null) ?? null}
                badge={`v${(t.version as number | null) ?? 1}`}
                isActive={!!t.is_active}
              />
            ))}
          </div>
        )}
      </div>
    </PatrolLayout>
  )
}
