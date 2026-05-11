import { notFound }     from 'next/navigation'
import Link             from 'next/link'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout }  from '../../../patrol-layout'
import { ArrowLeft }     from 'lucide-react'
import { ChecklistEditor } from './ChecklistEditor'
import { canManageTemplates } from '../../../_helpers/patrolRole'

export default async function ChecklistTemplatePage({
  params,
}: {
  params: Promise<{ slug: string; templateId: string }>
}) {
  const { slug, templateId } = await params

  const ctx = await requireApp(slug, 'patrol-navi', canManageTemplates)
  const orgId = ctx.actor.organizationId
  const supabaseAdmin = getAdminSupabase()

  // テンプレート取得（新規の場合はnull）
  const isNew = templateId === 'new'

  const template = isNew ? null : await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('*')
    .eq('id', templateId)
    .single()
    .then(r => r.data)

  if (!isNew && !template) notFound()

  // チェック項目一覧
  const { data: items } = isNew ? { data: [] } : await supabaseAdmin
    .from('patrol_items')
    .select('*')
    .eq('checklist_template_id', templateId)
    .eq('is_active', true)
    .order('sort_order')

  return (
    <PatrolLayout isAdmin={true}>
      <div className="mx-auto max-w-3xl p-4 sm:p-8">
        <Link
          href={`/org/${slug}/apps/patrol-navi/admin/checklists`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          チェックリスト一覧
        </Link>

        {!isNew && (
          <p className="mb-4 text-xs text-muted-foreground">
            編集を保存すると新しいバージョンが発行されます。過去に作成したシートは作成時のバージョンで凍結されています。
          </p>
        )}

        <ChecklistEditor
          slug={slug}
          templateId={isNew ? null : templateId}
          orgId={orgId}
          initialTemplate={template}
          initialItems={items ?? []}
        />
      </div>
    </PatrolLayout>
  )
}
