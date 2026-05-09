import Link            from 'next/link'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout }   from '../patrol-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../_ui/card'
import { ClipboardList, GitBranch, ArrowRight, UserCog } from 'lucide-react'
import { canManageTemplates } from '../_helpers/patrolRole'

export default async function PatrolAdminPage({
  params,
}: {
  params: Promise<{ slug: string; appId?: string }>
}) {
  const { slug } = await params

  const ctx = await requireApp(slug, 'patrol-navi', canManageTemplates)
  const orgId = ctx.actor.organizationId
  const supabaseAdmin = getAdminSupabase()

  // テンプレート数 / 役割数を取得
  const [clRes, wfRes, roleRes] = await Promise.all([
    supabaseAdmin
      .from('patrol_checklist_templates')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null),
    supabaseAdmin
      .from('patrol_workflow_templates')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null),
    supabaseAdmin
      .from('patrol_workflow_roles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null),
  ])

  const base = `/org/${slug}/apps/patrol-navi`

  const menus = [
    {
      href:        `${base}/admin/checklists`,
      icon:        ClipboardList,
      title:       'チェックリスト管理',
      description: 'チェックリストのテンプレートを作成・管理します',
      count:       clRes.count ?? 0,
      unit:        'テンプレート',
    },
    {
      href:        `${base}/admin/workflows`,
      icon:        GitBranch,
      title:       'ワークフロー管理',
      description: '承認フローのテンプレートを作成・管理します',
      count:       wfRes.count ?? 0,
      unit:        'テンプレート',
    },
    {
      href:        `${base}/admin/roles`,
      icon:        UserCog,
      title:       '役割管理',
      description: 'ワークフローの担当者として使えるロールと既定の担当者を管理します',
      count:       roleRes.count ?? 0,
      unit:        'ロール',
    },
  ]

  return (
    <PatrolLayout isAdmin={true}>
      <div className="p-4 sm:p-8">
        <h1 className="mb-1 text-xl font-bold sm:text-2xl">管理メニュー</h1>
        <p className="mb-8 text-sm text-muted-foreground">PatrolNavi のマスタデータを管理します</p>

        <div className="grid gap-4 sm:grid-cols-2">
          {menus.map(m => (
            <Link key={m.href} href={m.href}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <m.icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-base mt-3">{m.title}</CardTitle>
                  <CardDescription>{m.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">
                    {m.count}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">{m.unit}</span>
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </PatrolLayout>
  )
}
