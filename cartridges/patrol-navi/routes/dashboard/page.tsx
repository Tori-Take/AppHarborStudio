import Link from 'next/link'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout } from '../patrol-layout'
import { Card, CardContent, CardHeader, CardTitle } from '../_ui/card'
import { cn } from '../_ui/cn'
import { AlertCircle, ClipboardList, MapPin, TrendingUp, Bell, MessageSquare, AtSign } from 'lucide-react'
import { MonthlyTrendChart, CategoryBarChart } from './Charts'
import { isPatrolAdmin } from '../_helpers/patrolRole'

export const dynamic = 'force-dynamic'

type Period = '30' | '90' | '365'

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; appId?: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const { slug } = await params
  const { period: pParam } = await searchParams
  const period: Period = pParam === '30' ? '30' : pParam === '365' ? '365' : '90'
  const days = parseInt(period, 10)

  const ctx = await requireApp(slug, 'patrol-navi')
  const { actor, role } = ctx
  const supabaseAdmin = getAdminSupabase()

  // 期間の起点
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffISO = cutoff.toISOString().slice(0, 10)

  // シート + NG 集計
  const { data: sheetsRaw } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('id, patrol_date, site_name, status')
    .eq('organization_id', actor.organizationId)
    .is('deleted_at', null)
    .gte('patrol_date', cutoffISO)

  const sheets = sheetsRaw ?? []
  const sheetIds = sheets.map(s => s.id as string)

  // NG 項目（カテゴリ・本文・現場の集計用）
  const ngItems: { sheet_id: string; category1: string; category2: string; item_text: string }[] = []
  if (sheetIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('patrol_sheet_items')
      .select('sheet_id, category1, category2, item_text')
      .eq('result', 'ng')
      .in('sheet_id', sheetIds)
    ngItems.push(...(data ?? []) as typeof ngItems)
  }

  // 全項目数（NG 率算出用）
  let totalItems = 0
  if (sheetIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('patrol_sheet_items')
      .select('id', { count: 'exact', head: true })
      .in('sheet_id', sheetIds)
      .not('result', 'is', null)
    totalItems = count ?? 0
  }

  // KPI
  const totalSheets = sheets.length
  const totalNg     = ngItems.length
  const ngRate      = totalItems > 0 ? Math.round((totalNg / totalItems) * 1000) / 10 : 0
  const sites       = new Set(sheets.map(s => s.site_name as string))

  // 月次推移
  const monthMap = new Map<string, { sheets: number; ng: number }>()
  // 過去 N 月分を 0 で初期化
  const monthsBack = days <= 30 ? 1 : days <= 90 ? 3 : 12
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, { sheets: 0, ng: 0 })
  }
  for (const s of sheets) {
    const key = (s.patrol_date as string).slice(0, 7)
    if (!monthMap.has(key)) continue
    monthMap.get(key)!.sheets++
  }
  const sheetMonthMap = new Map<string, string>()
  for (const s of sheets) sheetMonthMap.set(s.id as string, (s.patrol_date as string).slice(0, 7))
  for (const it of ngItems) {
    const key = sheetMonthMap.get(it.sheet_id)
    if (key && monthMap.has(key)) monthMap.get(key)!.ng++
  }
  const monthlyTrend = Array.from(monthMap.entries()).map(([month, v]) => ({
    month: month.slice(5) + '月',  // "MM月"
    ...v,
  }))

  // カテゴリ別 NG 件数（category1 > category2）
  const catCount = new Map<string, number>()
  for (const it of ngItems) {
    const k = `${it.category1} / ${it.category2}`
    catCount.set(k, (catCount.get(k) ?? 0) + 1)
  }
  const topCategories = Array.from(catCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // 現場別 NG
  const sheetSiteMap = new Map<string, string>()
  for (const s of sheets) sheetSiteMap.set(s.id as string, s.site_name as string)
  const siteCount = new Map<string, number>()
  for (const it of ngItems) {
    const site = sheetSiteMap.get(it.sheet_id)
    if (!site) continue
    siteCount.set(site, (siteCount.get(site) ?? 0) + 1)
  }
  const topSites = Array.from(siteCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // 頻発 NG 項目（item_text）
  const itemCount = new Map<string, number>()
  for (const it of ngItems) {
    itemCount.set(it.item_text, (itemCount.get(it.item_text) ?? 0) + 1)
  }
  const topItems = Array.from(itemCount.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // ─── v2.5.0: 自分のワークフロー (pending step + @mention) ─────
  // 自分が assignee の pending step (現在のステージ)
  const { data: pendingStepsRaw } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('id, sheet_id, step_order, step_name, status, resolved_assignee_id, assignee_id')
    .eq('status', 'pending')
  type StepRow = { id: string; sheet_id: string; step_order: number; step_name: string; status: string; resolved_assignee_id: string | null; assignee_id: string | null }
  const pendingSteps = (pendingStepsRaw ?? []) as StepRow[]
  const myPendingSteps = pendingSteps.filter((s) => s.resolved_assignee_id === actor.id || s.assignee_id === actor.id)
  // 該当 sheet のメタ情報を取得
  let myActiveSheets: Array<{ sheet_id: string; site_name: string; patrol_date: string; current_step: number; step_name: string; created_at: string }> = []
  if (myPendingSteps.length > 0) {
    const sheetIds_my = Array.from(new Set(myPendingSteps.map((s) => s.sheet_id)))
    const { data: sheetsForSteps } = await supabaseAdmin
      .from('patrol_check_sheets')
      .select('id, site_name, patrol_date, current_step, status, created_at')
      .in('id', sheetIds_my)
      .eq('status', 'in_progress')
    const sheetMap = new Map<string, { id: string; site_name: string; patrol_date: string; current_step: number; status: string; created_at: string }>()
    for (const s of (sheetsForSteps as Array<{ id: string; site_name: string; patrol_date: string; current_step: number; status: string; created_at: string }> | null) ?? []) {
      sheetMap.set(s.id, s)
    }
    // current_step と一致するものだけ（並列含むので step_order が current_step）
    myActiveSheets = myPendingSteps
      .map((step) => {
        const s = sheetMap.get(step.sheet_id)
        if (!s) return null
        if (step.step_order !== s.current_step) return null
        return {
          sheet_id:     step.sheet_id,
          site_name:    s.site_name,
          patrol_date:  s.patrol_date,
          current_step: s.current_step,
          step_name:    step.step_name,
          created_at:   s.created_at,
        }
      })
      .filter((v): v is NonNullable<typeof v> => !!v)
  }

  // 自分への @mention (mock の .contains は未対応なので JS で filter)
  const { data: allCommentsRaw } = await supabaseAdmin
    .from('patrol_sheet_comments')
    .select('id, sheet_id, author_name_snapshot, body, mentioned_user_ids, requires_response, resolved_at, created_at')
    .eq('organization_id', actor.organizationId)
    .order('created_at', { ascending: false })
    .limit(100)
  type CommentRow = { id: string; sheet_id: string; author_name_snapshot: string; body: string; mentioned_user_ids: string[]; requires_response: boolean; resolved_at: string | null; created_at: string }
  const allComments = (allCommentsRaw ?? []) as CommentRow[]
  const myMentions = allComments.filter((c) => c.mentioned_user_ids?.includes(actor.id))
  const requiresResponse = myMentions.filter((c) => c.requires_response && !c.resolved_at)
  const informational    = myMentions.filter((c) => !c.requires_response || c.resolved_at)

  // ─── v2.5.0: 現場別パトロール実施頻度ヒートマップ ────────────
  // 現場 × 月 (過去 6 ヶ月) のセルに件数
  const heatmapMonths: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    heatmapMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const allSitesSet = new Set<string>()
  for (const s of sheets) allSitesSet.add(s.site_name as string)
  const allSitesList = Array.from(allSitesSet).sort()
  const heatmap: Record<string, Record<string, number>> = {}
  for (const site of allSitesList) {
    heatmap[site] = {}
    for (const m of heatmapMonths) heatmap[site][m] = 0
  }
  for (const s of sheets) {
    const m = (s.patrol_date as string).slice(0, 7)
    const site = s.site_name as string
    if (heatmap[site] && heatmap[site][m] !== undefined) {
      heatmap[site][m] = (heatmap[site][m] ?? 0) + 1
    }
  }

  const base = `/org/${slug}/apps/patrol-navi`
  const periods: { v: Period; label: string }[] = [
    { v: '30',  label: '直近 30 日' },
    { v: '90',  label: '直近 90 日' },
    { v: '365', label: '直近 1 年' },
  ]

  return (
    <PatrolLayout isAdmin={isPatrolAdmin(role)}>
      <div className="space-y-6 p-4 sm:p-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">ダッシュボード</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              パトロール記録の集計と NG 傾向
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border p-1 bg-muted/30">
            {periods.map(p => (
              <Link
                key={p.v}
                href={`${base}/dashboard?period=${p.v}`}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium',
                  period === p.v
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        {/* ─── 自分のワークフロー（v2.5.0） ─── */}
        <Card className="border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              自分のワークフロー
              <span className="text-xs font-normal text-muted-foreground">
                ({myActiveSheets.length + requiresResponse.length} 件)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 自分の判断待ちステップ */}
            {myActiveSheets.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ClipboardList className="h-3.5 w-3.5" />
                  あなたの判断待ち ({myActiveSheets.length})
                </div>
                <ul className="space-y-1.5">
                  {myActiveSheets.slice(0, 5).map((s) => (
                    <li key={s.sheet_id}>
                      <Link
                        href={`${base}/patrols/${s.sheet_id}`}
                        className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{s.site_name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Step {s.current_step} · {s.step_name} · {String(s.patrol_date).slice(0, 10)}
                          </div>
                        </div>
                        <span className="text-[11px] text-primary">→ 開く</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 返答待ち @mention */}
            {requiresResponse.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <AlertCircle className="h-3.5 w-3.5" />
                  返答待ち ({requiresResponse.length})
                </div>
                <ul className="space-y-1.5">
                  {requiresResponse.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`${base}/patrols/${c.sheet_id}`}
                        className="flex items-start justify-between gap-2 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2 text-sm hover:bg-amber-100/50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-muted-foreground">from {c.author_name_snapshot}</div>
                          <div className="line-clamp-1">{c.body}</div>
                        </div>
                        <span className="text-[11px] text-amber-700">→ 返答</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* @mention 既読のみ */}
            {informational.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <AtSign className="h-3.5 w-3.5" />
                  @mention ({informational.length})
                </div>
                <ul className="space-y-1">
                  {informational.slice(0, 3).map((c) => (
                    <li key={c.id} className="text-xs">
                      <Link
                        href={`${base}/patrols/${c.sheet_id}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        ・<span className="font-medium">{c.author_name_snapshot}</span>: {c.body.slice(0, 40)}{c.body.length > 40 ? '…' : ''}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {myActiveSheets.length === 0 && requiresResponse.length === 0 && informational.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                <MessageSquare className="mb-1 inline h-4 w-4 mr-1" />
                通知はありません
              </p>
            )}
          </CardContent>
        </Card>

        {/* KPI カード */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi icon={<ClipboardList className="h-5 w-5" />} label="シート数"        value={totalSheets} />
          <Kpi icon={<AlertCircle   className="h-5 w-5 text-red-600" />} label="NG 件数" value={totalNg} valueClass="text-red-700" />
          <Kpi icon={<TrendingUp    className="h-5 w-5" />} label="NG 率"          value={`${ngRate}%`} />
          <Kpi icon={<MapPin        className="h-5 w-5" />} label="対象現場数"     value={sites.size} />
        </div>

        {/* ─── 現場別パトロール実施頻度ヒートマップ（v2.5.0） ─── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">現場別パトロール実施頻度（過去 6 ヶ月）</CardTitle>
          </CardHeader>
          <CardContent>
            {allSitesList.length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border-b py-2 px-2 text-left font-medium text-muted-foreground sticky left-0 bg-background">現場</th>
                      {heatmapMonths.map((m) => (
                        <th key={m} className="border-b py-2 px-2 text-center font-medium text-muted-foreground">
                          {m.slice(5)}月
                        </th>
                      ))}
                      <th className="border-b py-2 px-2 text-center font-medium text-muted-foreground">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allSitesList.map((site) => {
                      const total = heatmapMonths.reduce((sum, m) => sum + (heatmap[site][m] ?? 0), 0)
                      // 直近 3 ヶ月で 0 件 = 警告
                      const recentMonths = heatmapMonths.slice(-3)
                      const recentTotal = recentMonths.reduce((sum, m) => sum + (heatmap[site][m] ?? 0), 0)
                      const stale = recentTotal === 0
                      return (
                        <tr key={site} className="hover:bg-muted/30">
                          <td className={cn(
                            'border-b py-2 px-2 sticky left-0 bg-background',
                            stale && 'text-amber-700 font-medium',
                          )}>
                            {site}
                            {stale && <span className="ml-1 text-[10px]">⚠</span>}
                          </td>
                          {heatmapMonths.map((m) => {
                            const count = heatmap[site][m] ?? 0
                            const intensity = count === 0 ? 0 : Math.min(count, 5)
                            return (
                              <td
                                key={m}
                                className={cn(
                                  'border-b py-2 px-2 text-center',
                                  intensity === 0 && 'text-muted-foreground/40',
                                  intensity === 1 && 'bg-emerald-50 dark:bg-emerald-900/20',
                                  intensity === 2 && 'bg-emerald-100 dark:bg-emerald-900/40',
                                  intensity === 3 && 'bg-emerald-200 dark:bg-emerald-800/50',
                                  intensity === 4 && 'bg-emerald-300 dark:bg-emerald-800/70',
                                  intensity >= 5 && 'bg-emerald-400 text-white dark:bg-emerald-700',
                                )}
                                title={count === 0 ? '未実施' : `${count} 件実施`}
                              >
                                {count === 0 ? '–' : count}
                              </td>
                            )
                          })}
                          <td className="border-b py-2 px-2 text-center font-medium tabular-nums">{total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  ⚠ 直近 3 ヶ月で実施されていない現場
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 月次推移 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">月次推移</CardTitle>
          </CardHeader>
          <CardContent>
            {totalSheets === 0
              ? <Empty />
              : <MonthlyTrendChart data={monthlyTrend} />}
          </CardContent>
        </Card>

        {/* カテゴリ別 / 現場別 NG */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">カテゴリ別 NG（Top 10）</CardTitle>
            </CardHeader>
            <CardContent>
              {topCategories.length === 0 ? <Empty /> : <CategoryBarChart data={topCategories} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">現場別 NG（Top 10）</CardTitle>
            </CardHeader>
            <CardContent>
              {topSites.length === 0 ? <Empty /> : <CategoryBarChart data={topSites} />}
            </CardContent>
          </Card>
        </div>

        {/* 頻発 NG 項目 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">頻発 NG 項目（Top 10）</CardTitle>
          </CardHeader>
          <CardContent>
            {topItems.length === 0 ? <Empty /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">項目</th>
                    <th className="w-20 py-2 text-right font-medium">NG 件数</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topItems.map((it, i) => (
                    <tr key={i}>
                      <td className="py-2">{it.text}</td>
                      <td className="py-2 text-right font-medium text-red-700">{it.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </PatrolLayout>
  )
}

function Kpi({ icon, label, value, valueClass }: {
  icon: React.ReactNode
  label: string
  value: number | string
  valueClass?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn('text-2xl font-bold', valueClass)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Empty() {
  return <p className="py-8 text-center text-sm text-muted-foreground">データがありません</p>
}
