import Link from 'next/link'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout }     from '../patrol-layout'
import { buttonVariants }   from '../_ui/button'
import { cn }               from '../_ui/cn'
import { ClipboardList, AlertCircle } from 'lucide-react'
import {
  SHEET_STATUS_LABEL,
  SHEET_STATUS_COLOR,
  type PatrolCheckSheet,
  type PatrolSheetStatus,
} from '../_types'
import { isPatrolAdmin } from '../_helpers/patrolRole'
import { PatrolFilters } from './PatrolFilters'

type Tab = 'mine' | 'action' | 'all'

export default async function PatrolsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; appId?: string }>
  searchParams: Promise<{
    tab?: string
    from?: string
    to?: string
    site?: string
    patroller?: string
    status?: string
    ng?: string
  }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const tab = (sp.tab === 'action' ? 'action' : sp.tab === 'all' ? 'all' : 'mine') as Tab

  const ctx = await requireApp(slug, 'patrol-navi')
  const { actor, role } = ctx
  const user = { id: actor.id }
  const organizationId = actor.organizationId
  const supabaseAdmin = getAdminSupabase()

  const base = `/org/${slug}/apps/patrol-navi/patrols`

  // フィルタ条件をクエリに反映
  let query = supabaseAdmin
    .from('patrol_check_sheets')
    .select('*')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)

  if (sp.from)       query = query.gte('patrol_date', sp.from)
  if (sp.to)         query = query.lte('patrol_date', sp.to)
  if (sp.site)       query = query.ilike('site_name', `%${sp.site}%`)
  if (sp.patroller)  query = query.eq('patroller_id', sp.patroller)
  if (sp.status)     query = query.eq('status', sp.status)

  const { data: sheets, error } = await query.order('patrol_date', { ascending: false })

  if (error) {
    return <p className="p-8 text-destructive">データの取得に失敗しました</p>
  }

  let allSheets = (sheets ?? []) as PatrolCheckSheet[]

  // 自分が承認担当者で pending なシート ID を取得（アクション必要タブ用）
  const myActionSheetIds = new Set<string>()
  if (allSheets.length > 0) {
    const { data: mySteps } = await supabaseAdmin
      .from('patrol_sheet_steps')
      .select('sheet_id, step_order')
      .eq('assignee_id', user.id)
      .eq('status', 'pending')
      .in('sheet_id', allSheets.map(s => s.id))
    const stepMap = new Map<string, number>()
    for (const r of mySteps ?? []) stepMap.set(r.sheet_id as string, r.step_order as number)
    for (const s of allSheets) {
      if (s.status === 'in_progress' && stepMap.get(s.id) === s.current_step) {
        myActionSheetIds.add(s.id)
      }
    }
  }

  // NG フィルタ：当該シートに ng の項目があるか
  let ngSheetIds: Set<string> | null = null
  if (sp.ng === '1' && allSheets.length > 0) {
    const { data: ngItems } = await supabaseAdmin
      .from('patrol_sheet_items')
      .select('sheet_id')
      .eq('result', 'ng')
      .in('sheet_id', allSheets.map(s => s.id))
    ngSheetIds = new Set((ngItems ?? []).map(i => i.sheet_id as string))
    allSheets = allSheets.filter(s => ngSheetIds!.has(s.id))
  }

  // タブ別フィルタ
  const filteredSheets =
    tab === 'mine'
      ? allSheets.filter(s => s.patroller_id === user.id)
      : tab === 'action'
      ? allSheets.filter(s => myActionSheetIds.has(s.id))
      : allSheets

  // タブ件数はフィルタ後のシート数を基準にする
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'mine',   label: '自分のパトロール', count: allSheets.filter(s => s.patroller_id === user.id).length },
    { key: 'action', label: '要承認',           count: allSheets.filter(s => myActionSheetIds.has(s.id)).length },
    { key: 'all',    label: 'すべて',           count: allSheets.length },
  ]

  // パトロール者候補（同じ org の active プロフィール）
  const { data: patrollerProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('display_name')

  // 表示用: id → display_name のマップ
  const patrollerNameMap = new Map<string, string>(
    (patrollerProfiles ?? []).map(p => [p.id as string, p.display_name as string])
  )

  // タブを切り替えても同じ条件は維持（リンクの URL 構築用）
  const buildTabHref = (key: Tab) => {
    const params = new URLSearchParams()
    params.set('tab', key)
    for (const k of ['from', 'to', 'site', 'patroller', 'status', 'ng'] as const) {
      if (sp[k]) params.set(k, sp[k]!)
    }
    return `${base}?${params.toString()}`
  }

  // NG 件数表示用に、表示シートの NG 件数を一括取得
  const ngCountMap = new Map<string, number>()
  if (filteredSheets.length > 0) {
    const { data: ngItems2 } = await supabaseAdmin
      .from('patrol_sheet_items')
      .select('sheet_id')
      .eq('result', 'ng')
      .in('sheet_id', filteredSheets.map(s => s.id))
    for (const row of ngItems2 ?? []) {
      const id = row.sheet_id as string
      ngCountMap.set(id, (ngCountMap.get(id) ?? 0) + 1)
    }
  }

  return (
    <PatrolLayout isAdmin={isPatrolAdmin(role)}>
      <div className="p-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">パトロール一覧</h1>
        </div>

        {/* タブ */}
        <div className="mb-4 flex gap-1 rounded-lg border p-1 bg-muted/30 w-fit">
          {tabs.map(t => (
            <Link
              key={t.key}
              href={buildTabHref(t.key)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              <span className={cn(
                'ml-1.5 rounded-full px-1.5 py-0.5 text-xs',
                tab === t.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {t.count}
              </span>
            </Link>
          ))}
        </div>

        {/* フィルタ */}
        <PatrolFilters patrollers={patrollerProfiles ?? []} />

        {/* 一覧テーブル */}
        {filteredSheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
            <ClipboardList className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">該当するパトロール記録がありません</p>
            <Link
              href={`${base}/new`}
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
            >
              最初のパトロールを開始する
            </Link>
          </div>
        ) : (
          <>
            {/* デスクトップ: テーブル */}
            <div className="hidden overflow-hidden rounded-lg border md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">実施日</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">現場名</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">クルー名</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">パトロール者</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">ステータス</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredSheets.map(sheet => {
                    const ngCount = ngCountMap.get(sheet.id) ?? 0
                    const isOwn = sheet.patroller_id === user.id
                    const isAdmin = isPatrolAdmin(role)
                    const isDraftOrRemanded = sheet.status === 'draft' || sheet.status === 'remanded'
                    // 編集可能なのは draft/remanded のシートのみ。
                    // admin でも in_progress / completed は編集不可（閲覧のみ）
                    const canEdit = isDraftOrRemanded && (isOwn || isAdmin)
                    const needsAction = myActionSheetIds.has(sheet.id)
                    const editHref = canEdit ? `${base}/${sheet.id}/edit` : `${base}/${sheet.id}`
                    const editLabel = canEdit
                      ? (!isAdmin && sheet.status === 'draft' ? '記入する' : '編集')
                      : needsAction ? '確認' : '表示'
                    return (
                      <tr key={sheet.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          {sheet.patrol_date?.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3">{sheet.site_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {sheet.crew_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {patrollerNameMap.get(sheet.patroller_id) ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {ngCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                <AlertCircle className="h-3 w-3" />
                                NG {ngCount}
                              </span>
                            )}
                            <span className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              SHEET_STATUS_COLOR[sheet.status as PatrolSheetStatus]
                            )}>
                              {SHEET_STATUS_LABEL[sheet.status as PatrolSheetStatus]}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={editHref}
                            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                          >
                            {editLabel}
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* モバイル: カード */}
            <div className="space-y-2 md:hidden">
              {filteredSheets.map(sheet => {
                const ngCount = ngCountMap.get(sheet.id) ?? 0
                const isOwn = sheet.patroller_id === user.id
                const isDraftOrRemanded = sheet.status === 'draft' || sheet.status === 'remanded'
                const canEdit = isDraftOrRemanded && (isOwn || isPatrolAdmin(role))
                const editHref = canEdit ? `${base}/${sheet.id}/edit` : `${base}/${sheet.id}`
                return (
                  <Link
                    key={sheet.id}
                    href={editHref}
                    className="block rounded-lg border bg-background p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-xs text-muted-foreground">{sheet.patrol_date?.slice(0, 10)}</p>
                        <p className="truncate font-medium">{sheet.site_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sheet.crew_name ?? '—'}
                          {patrollerNameMap.get(sheet.patroller_id) && <> · {patrollerNameMap.get(sheet.patroller_id)}</>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {ngCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                            <AlertCircle className="h-3 w-3" />
                            NG {ngCount}
                          </span>
                        )}
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                          SHEET_STATUS_COLOR[sheet.status as PatrolSheetStatus]
                        )}>
                          {SHEET_STATUS_LABEL[sheet.status as PatrolSheetStatus]}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </PatrolLayout>
  )
}
