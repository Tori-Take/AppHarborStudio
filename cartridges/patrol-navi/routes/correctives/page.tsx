import Link from 'next/link'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout } from '../patrol-layout'
import { Card, CardContent, CardHeader, CardTitle } from '../_ui/card'
import { cn } from '../_ui/cn'
import { CheckCheck, ListTodo, AlertTriangle } from 'lucide-react'
import {
  CORRECTIVE_STATUS_LABEL, CORRECTIVE_STATUS_COLOR,
  type CorrectiveActionStatus, type PatrolCorrectiveAction,
} from '../_types'
import { CompleteButton } from './CompleteButton'
import { isPatrolAdmin } from '../_helpers/patrolRole'

export const dynamic = 'force-dynamic'

type Tab = 'mine' | 'open' | 'all'

export default async function CorrectivesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; appId?: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { slug } = await params
  const { tab: t } = await searchParams
  const tab: Tab = t === 'open' ? 'open' : t === 'all' ? 'all' : 'mine'

  const ctx = await requireApp(slug, 'patrol-navi')
  const { actor, role } = ctx
  const supabaseAdmin = getAdminSupabase()

  let query = supabaseAdmin
    .from('patrol_corrective_actions')
    .select('*')
    .eq('organization_id', actor.organizationId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (tab === 'mine') query = query.eq('assignee_id', actor.id).in('status', ['open', 'in_progress'])
  if (tab === 'open') query = query.in('status', ['open', 'in_progress'])

  const { data: actionsRaw } = await query
  const actions = (actionsRaw ?? []) as PatrolCorrectiveAction[]

  // 関連項目とシート情報を一括取得
  const itemIds = Array.from(new Set(actions.map(a => a.sheet_item_id)))
  const itemMap = new Map<string, { item_text: string; category1: string; category2: string; sheet_id: string }>()
  const sheetMap = new Map<string, { id: string; site_name: string; patrol_date: string }>()
  if (itemIds.length > 0) {
    const { data: items } = await supabaseAdmin
      .from('patrol_sheet_items')
      .select('id, item_text, category1, category2, sheet_id')
      .in('id', itemIds)
    for (const it of items ?? []) {
      itemMap.set(it.id as string, {
        item_text: it.item_text as string,
        category1: it.category1 as string,
        category2: it.category2 as string,
        sheet_id:  it.sheet_id as string,
      })
    }
    const sheetIds = Array.from(new Set(Array.from(itemMap.values()).map(v => v.sheet_id)))
    if (sheetIds.length > 0) {
      const { data: sheets } = await supabaseAdmin
        .from('patrol_check_sheets')
        .select('id, site_name, patrol_date')
        .in('id', sheetIds)
      for (const s of sheets ?? []) {
        sheetMap.set(s.id as string, {
          id: s.id as string, site_name: s.site_name as string, patrol_date: s.patrol_date as string,
        })
      }
    }
  }

  // 担当者名
  const assigneeIds = Array.from(new Set(actions.map(a => a.assignee_id)))
  const profileMap = new Map<string, string>()
  if (assigneeIds.length > 0) {
    const { data } = await supabaseAdmin.from('profiles').select('id, display_name').in('id', assigneeIds)
    for (const p of data ?? []) profileMap.set(p.id as string, p.display_name as string)
  }

  const base = `/org/${slug}/apps/patrol-navi/correctives`
  const today = new Date().toISOString().slice(0, 10)

  // 全件のタブ別カウントを別途取得する（簡略化のため省略・概数表示）
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'mine', label: '自分の対応',   icon: <ListTodo className="h-3.5 w-3.5" /> },
    { key: 'open', label: '未完了すべて', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    { key: 'all',  label: 'すべて',       icon: <CheckCheck className="h-3.5 w-3.5" /> },
  ]

  return (
    <PatrolLayout isAdmin={isPatrolAdmin(role)}>
      <div className="p-4 sm:p-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold sm:text-2xl">是正アクション</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            NG だった項目への対応状況を追跡します
          </p>
        </div>

        <div className="mb-4 flex gap-1 rounded-lg border p-1 bg-muted/30 w-fit">
          {tabs.map(t => (
            <Link
              key={t.key}
              href={`${base}?tab=${t.key}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                tab === t.key ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.icon}{t.label}
            </Link>
          ))}
        </div>

        {actions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              該当する是正アクションはありません
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {actions.map(a => {
              const item  = itemMap.get(a.sheet_item_id)
              const sheet = item ? sheetMap.get(item.sheet_id) : null
              const overdue = a.due_date && a.due_date < today && (a.status === 'open' || a.status === 'in_progress')
              const isAssignee = a.assignee_id === actor.id
              return (
                <Card key={a.id} className={cn(overdue && 'border-red-300')}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          CORRECTIVE_STATUS_COLOR[a.status as CorrectiveActionStatus]
                        )}>
                          {CORRECTIVE_STATUS_LABEL[a.status as CorrectiveActionStatus]}
                        </span>
                        {overdue && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            <AlertTriangle className="h-3 w-3" />期限超過
                          </span>
                        )}
                        {a.due_date && (
                          <span className="text-xs text-muted-foreground">
                            期限: {a.due_date}
                          </span>
                        )}
                      </div>
                      <CardTitle className="mt-1 text-sm leading-snug">
                        {item?.item_text ?? '（項目情報なし）'}
                      </CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item ? `${item.category1} / ${item.category2}` : ''}
                        {sheet && (
                          <>　／
                            <Link
                              href={`/org/${slug}/apps/patrol-navi/patrols/${sheet.id}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {sheet.site_name}（{sheet.patrol_date?.slice(0, 10)}）
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      担当: {profileMap.get(a.assignee_id) ?? '—'}
                    </div>
                  </CardHeader>
                  {(a.comment || a.completion_note) && (
                    <CardContent className="pb-3 pt-0 text-sm">
                      {a.comment && (
                        <p className="text-muted-foreground"><span className="font-medium">指示: </span>{a.comment}</p>
                      )}
                      {a.completion_note && (
                        <p className="mt-1 text-muted-foreground"><span className="font-medium">対応報告: </span>{a.completion_note}</p>
                      )}
                    </CardContent>
                  )}
                  {(isAssignee || actor.orgRole !== 'member') && (a.status === 'open' || a.status === 'in_progress') && (
                    <CardContent className="border-t pt-3">
                      <CompleteButton slug={slug} actionId={a.id} status={a.status as CorrectiveActionStatus} />
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </PatrolLayout>
  )
}
