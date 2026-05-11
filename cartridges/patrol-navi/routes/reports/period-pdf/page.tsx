/**
 * 期間レポート PDF（A3 横 2 面）
 *
 * GET /org/[slug]/apps/patrol-navi/reports/period-pdf?from=YYYY-MM-DD&to=YYYY-MM-DD&auto=1
 *
 * 表面: ヘッダー + KPI + パトロール一覧 + NG分析
 * 裏面: 是正アクション + NG項目詳細
 */

import { requireApp, getAdminSupabase } from '@/sdk'
import {
  SHEET_STATUS_LABEL,
  CORRECTIVE_STATUS_LABEL,
  type PatrolSheetStatus,
  type CorrectiveActionStatus,
} from '../../_types'
import { canViewPatrols } from '../../_helpers/patrolRole'
import { AutoPrint } from './AutoPrint'

export const dynamic = 'force-dynamic'

export default async function PeriodPdfPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ from?: string; to?: string; auto?: string }>
}) {
  const { slug } = await params
  const sp       = await searchParams
  const ctx      = await requireApp(slug, 'patrol-navi', canViewPatrols)
  const orgId    = ctx.actor.organizationId

  // デフォルト期間: 直近 90 日
  const defaultTo   = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 90)
  const fromStr = sp.from ?? defaultFrom.toISOString().slice(0, 10)
  const toStr   = sp.to   ?? defaultTo.toISOString().slice(0, 10)
  const autoPrint = sp.auto === '1'

  const supabase = getAdminSupabase()

  // 組織名
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()
  const orgName = (orgData as { name?: string } | null)?.name ?? ''

  // パトロールシート
  const { data: sheetsRaw } = await supabase
    .from('patrol_check_sheets')
    .select('*')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .gte('patrol_date', fromStr)
    .lte('patrol_date', toStr)
    .order('patrol_date', { ascending: true })
  type SheetRow = {
    id: string
    patrol_date: string
    site_name: string
    crew_name: string | null
    status: string
    patroller_id: string
    feedback: string | null
  }
  const sheets = (sheetsRaw ?? []) as SheetRow[]
  const sheetIds = sheets.map(s => s.id)

  // プロフィール
  const nameMap = new Map<string, string>()
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('organization_id', orgId)
  for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
    nameMap.set(p.id, p.display_name ?? p.id)
  }

  // 全項目
  type ItemRow = {
    id: string
    sheet_id: string
    category1: string
    category2: string
    category3: string | null
    item_text: string
    is_important: boolean
    result: string | null
    comment: string | null
  }
  let items: ItemRow[] = []
  if (sheetIds.length > 0) {
    const { data } = await supabase
      .from('patrol_sheet_items')
      .select('id, sheet_id, category1, category2, category3, item_text, is_important, result, comment')
      .in('sheet_id', sheetIds)
    items = (data ?? []) as ItemRow[]
  }

  // 是正アクション
  type CARow = {
    id: string
    sheet_item_id: string
    assignee_id: string
    due_date: string | null
    status: string
    comment: string | null
    completed_at: string | null
  }
  const itemIds = items.map(i => i.id)
  let cas: CARow[] = []
  if (itemIds.length > 0) {
    const { data } = await supabase
      .from('patrol_corrective_actions')
      .select('id, sheet_item_id, assignee_id, due_date, status, comment, completed_at')
      .in('sheet_item_id', itemIds)
      .order('due_date')
    cas = (data ?? []) as CARow[]
  }
  const caByItem = new Map<string, CARow[]>()
  for (const ca of cas) {
    const arr = caByItem.get(ca.sheet_item_id) ?? []
    arr.push(ca)
    caByItem.set(ca.sheet_item_id, arr)
  }

  // ─── 集計 ─────────────────────────────────────────
  const totalSheets = sheets.length
  const completedSheets   = sheets.filter(s => s.status === 'completed').length
  const inProgressSheets  = sheets.filter(s => s.status === 'in_progress').length
  const remandedSheets    = sheets.filter(s => s.status === 'remanded').length
  const draftSheets       = sheets.filter(s => s.status === 'draft').length

  const totalItems = items.length
  const okCount    = items.filter(i => i.result === 'ok').length
  const ngCount    = items.filter(i => i.result === 'ng').length
  const noneCount  = items.filter(i => i.result === 'none').length
  const filledCount = okCount + ngCount + noneCount
  const completionRate = totalItems > 0 ? Math.round((filledCount / totalItems) * 100) : 0
  const ngRate = filledCount > 0 ? Math.round((ngCount / filledCount) * 1000) / 10 : 0
  const importantNg = items.filter(i => i.result === 'ng' && i.is_important).length

  const sites = new Set(sheets.map(s => s.site_name))

  // 是正集計
  const caOpen      = cas.filter(c => c.status === 'open').length
  const caInProg    = cas.filter(c => c.status === 'in_progress').length
  const caCompleted = cas.filter(c => c.status === 'completed').length
  const caCancelled = cas.filter(c => c.status === 'cancelled').length
  const today = new Date().toISOString().slice(0, 10)
  const caOverdue = cas.filter(c =>
    (c.status === 'open' || c.status === 'in_progress') &&
    c.due_date && c.due_date < today
  ).length

  // パトロール毎のNG件数 + 是正状況
  const sheetStats = new Map<string, { ng: number; importantNg: number; caOpen: number; caCompleted: number }>()
  for (const s of sheets) {
    sheetStats.set(s.id, { ng: 0, importantNg: 0, caOpen: 0, caCompleted: 0 })
  }
  for (const it of items) {
    if (it.result !== 'ng') continue
    const st = sheetStats.get(it.sheet_id)
    if (!st) continue
    st.ng++
    if (it.is_important) st.importantNg++
    const itemCas = caByItem.get(it.id) ?? []
    for (const ca of itemCas) {
      if (ca.status === 'completed') st.caCompleted++
      else if (ca.status !== 'cancelled') st.caOpen++
    }
  }

  // カテゴリ別NG (Top 10)
  const catCount = new Map<string, number>()
  for (const it of items) {
    if (it.result !== 'ng') continue
    const k = `${it.category1} / ${it.category2}`
    catCount.set(k, (catCount.get(k) ?? 0) + 1)
  }
  const topCategories = Array.from(catCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  const maxCat = topCategories[0]?.count ?? 1

  // 現場別NG (Top 10)
  const siteNg = new Map<string, number>()
  const sheetSiteMap = new Map<string, string>()
  for (const s of sheets) sheetSiteMap.set(s.id, s.site_name)
  for (const it of items) {
    if (it.result !== 'ng') continue
    const site = sheetSiteMap.get(it.sheet_id)
    if (!site) continue
    siteNg.set(site, (siteNg.get(site) ?? 0) + 1)
  }
  const topSites = Array.from(siteNg.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  const maxSite = topSites[0]?.count ?? 1

  // 頻発NG項目 (Top 10)
  const itemTextCount = new Map<string, { count: number; isImportant: boolean }>()
  for (const it of items) {
    if (it.result !== 'ng') continue
    const cur = itemTextCount.get(it.item_text)
    if (cur) {
      cur.count++
      if (it.is_important) cur.isImportant = true
    } else {
      itemTextCount.set(it.item_text, { count: 1, isImportant: it.is_important })
    }
  }
  const topItems = Array.from(itemTextCount.entries())
    .map(([text, v]) => ({ text, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // 担当者別 是正状況
  const caAssigneeStats = new Map<string, { open: number; inProg: number; done: number; overdue: number }>()
  for (const ca of cas) {
    const aid = ca.assignee_id
    const st = caAssigneeStats.get(aid) ?? { open: 0, inProg: 0, done: 0, overdue: 0 }
    if (ca.status === 'open') st.open++
    else if (ca.status === 'in_progress') st.inProg++
    else if (ca.status === 'completed') st.done++
    if ((ca.status === 'open' || ca.status === 'in_progress') && ca.due_date && ca.due_date < today) st.overdue++
    caAssigneeStats.set(aid, st)
  }

  // NG項目詳細リスト（実施日 + 現場 + 項目）
  const ngItemsDetail = items
    .filter(i => i.result === 'ng')
    .map(i => {
      const s = sheets.find(sh => sh.id === i.sheet_id)
      const itemCas = caByItem.get(i.id) ?? []
      return {
        date: s?.patrol_date.slice(0, 10) ?? '',
        site: s?.site_name ?? '',
        cat: `${i.category1} / ${i.category2}`,
        text: i.item_text,
        comment: i.comment ?? '',
        important: i.is_important,
        ca: itemCas[0],
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  // 是正全件
  const caDetailList = cas
    .map(ca => {
      const item = items.find(it => it.id === ca.sheet_item_id)
      const sheet = item ? sheets.find(s => s.id === item.sheet_id) : undefined
      return {
        date: sheet?.patrol_date.slice(0, 10) ?? '',
        site: sheet?.site_name ?? '',
        item: item?.item_text ?? '',
        assignee: nameMap.get(ca.assignee_id) ?? ca.assignee_id,
        dueDate: ca.due_date ?? '',
        status: ca.status,
        comment: ca.comment ?? '',
        overdue: (ca.status === 'open' || ca.status === 'in_progress') && !!ca.due_date && ca.due_date < today,
      }
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
    })

  const base = `/org/${slug}/apps/patrol-navi`
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <>
      {/* A3 横 2 面のレイアウト用 CSS */}
      <style>{`
        @page {
          size: A3 landscape;
          margin: 8mm;
        }
        @media print {
          html, body { background: white !important; }
          .pdf-root { font-family: 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif; }
          .page-break { page-break-after: always; break-after: page; }
        }
        .pdf-root { font-size: 9pt; color: #111; }
        .pdf-page {
          width: 100%;
          background: white;
        }
        @media screen {
          .pdf-page {
            max-width: 1400px;
            margin: 0 auto 16px;
            border: 1px solid #e5e5e5;
            padding: 12mm;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          }
        }
      `}</style>

      <AutoPrint backHref={`${base}/reports`} autoPrint={autoPrint} />

      <div className="pdf-root">
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* 表面 */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="pdf-page page-break">
          {/* ヘッダー */}
          <div className="flex items-end justify-between border-b-2 border-gray-800 pb-2 mb-3">
            <div>
              <h1 className="text-xl font-bold">パトロール実施報告書</h1>
              <p className="mt-0.5 text-sm">
                期間: <strong>{fromStr}</strong> 〜 <strong>{toStr}</strong>
                <span className="ml-3 text-gray-500">({totalSheets} 件)</span>
              </p>
            </div>
            <div className="text-right text-xs text-gray-600">
              <p>{orgName}</p>
              <p>出力日: {todayStr}</p>
              <p className="text-[10px]">出力者: {nameMap.get(ctx.actor.id) ?? ''}</p>
            </div>
          </div>

          {/* KPI 8 個 */}
          <div className="grid grid-cols-8 gap-2 mb-3">
            <Kpi label="総パトロール数" value={totalSheets} />
            <Kpi label="完了" value={completedSheets} subValue={`${totalSheets > 0 ? Math.round((completedSheets/totalSheets)*100) : 0}%`} color="green" />
            <Kpi label="承認中" value={inProgressSheets} color="blue" />
            <Kpi label="差戻し" value={remandedSheets} color="amber" />
            <Kpi label="NG 件数" value={ngCount} subValue={`${ngRate}%`} color="red" />
            <Kpi label="重要NG" value={importantNg} color="red" />
            <Kpi label="未着手是正" value={caOpen + caInProg} subValue={caOverdue > 0 ? `期限超過 ${caOverdue}` : ''} color={caOverdue > 0 ? 'red' : 'amber'} />
            <Kpi label="是正完了" value={caCompleted} color="green" />
          </div>

          {/* 2 カラム: パトロール一覧 (左) | 分析 (右) */}
          <div className="grid grid-cols-[3fr_2fr] gap-3">
            {/* 左: パトロール一覧 */}
            <section>
              <h2 className="mb-1 text-sm font-bold border-b border-gray-400 pb-0.5">パトロール一覧（{totalSheets} 件）</h2>
              <table className="w-full border-collapse text-[8.5pt]">
                <thead>
                  <tr className="border-b-2 border-gray-700 bg-gray-100">
                    <th className="px-1 py-1 text-left">実施日</th>
                    <th className="px-1 py-1 text-left">現場</th>
                    <th className="px-1 py-1 text-left">クルー</th>
                    <th className="px-1 py-1 text-left">パトロール者</th>
                    <th className="px-1 py-1 text-center">ステータス</th>
                    <th className="px-1 py-1 text-right">NG</th>
                    <th className="px-1 py-1 text-right">重要NG</th>
                    <th className="px-1 py-1 text-right">是正<br/>(未/完)</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.length === 0 && (
                    <tr><td colSpan={8} className="py-4 text-center text-gray-400">パトロール記録がありません</td></tr>
                  )}
                  {sheets.map(s => {
                    const st = sheetStats.get(s.id) ?? { ng: 0, importantNg: 0, caOpen: 0, caCompleted: 0 }
                    return (
                      <tr key={s.id} className="border-b border-gray-200">
                        <td className="px-1 py-0.5 whitespace-nowrap">{s.patrol_date.slice(0, 10)}</td>
                        <td className="px-1 py-0.5 truncate max-w-[10em]">{s.site_name}</td>
                        <td className="px-1 py-0.5 truncate max-w-[8em]">{s.crew_name ?? ''}</td>
                        <td className="px-1 py-0.5 truncate max-w-[7em]">{nameMap.get(s.patroller_id) ?? ''}</td>
                        <td className="px-1 py-0.5 text-center text-[8pt]">{SHEET_STATUS_LABEL[s.status as PatrolSheetStatus] ?? s.status}</td>
                        <td className={`px-1 py-0.5 text-right tabular-nums ${st.ng > 0 ? 'font-bold text-red-700' : ''}`}>{st.ng || '–'}</td>
                        <td className={`px-1 py-0.5 text-right tabular-nums ${st.importantNg > 0 ? 'font-bold text-red-700' : ''}`}>{st.importantNg || '–'}</td>
                        <td className="px-1 py-0.5 text-right tabular-nums text-[8pt]">
                          {st.caOpen + st.caCompleted > 0 ? `${st.caOpen}/${st.caCompleted}` : '–'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {sheets.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-700 bg-gray-50 font-bold">
                      <td colSpan={5} className="px-1 py-1 text-right">合計</td>
                      <td className="px-1 py-1 text-right tabular-nums text-red-700">{ngCount}</td>
                      <td className="px-1 py-1 text-right tabular-nums text-red-700">{importantNg}</td>
                      <td className="px-1 py-1 text-right tabular-nums text-[8pt]">{caOpen + caInProg}/{caCompleted}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </section>

            {/* 右: 分析 */}
            <section className="space-y-3">
              {/* カテゴリ別NG */}
              <div>
                <h2 className="mb-1 text-sm font-bold border-b border-gray-400 pb-0.5">カテゴリ別 NG（Top 10）</h2>
                {topCategories.length === 0
                  ? <p className="text-xs text-gray-400 py-2">NG なし</p>
                  : (
                    <table className="w-full text-[8.5pt]">
                      <tbody>
                        {topCategories.map((c, i) => (
                          <tr key={i}>
                            <td className="py-0.5 pr-2 truncate max-w-[14em]">{c.name}</td>
                            <td className="py-0.5 w-full">
                              <div className="flex items-center gap-1">
                                <div className="bg-red-200 h-3" style={{ width: `${(c.count / maxCat) * 100}%`, minWidth: '2px' }} />
                                <span className="tabular-nums font-medium text-red-700">{c.count}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>

              {/* 現場別NG */}
              <div>
                <h2 className="mb-1 text-sm font-bold border-b border-gray-400 pb-0.5">現場別 NG（Top 10）</h2>
                {topSites.length === 0
                  ? <p className="text-xs text-gray-400 py-2">NG なし</p>
                  : (
                    <table className="w-full text-[8.5pt]">
                      <tbody>
                        {topSites.map((s, i) => (
                          <tr key={i}>
                            <td className="py-0.5 pr-2 truncate max-w-[14em]">{s.name}</td>
                            <td className="py-0.5 w-full">
                              <div className="flex items-center gap-1">
                                <div className="bg-red-200 h-3" style={{ width: `${(s.count / maxSite) * 100}%`, minWidth: '2px' }} />
                                <span className="tabular-nums font-medium text-red-700">{s.count}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>

              {/* 頻発NG項目 */}
              <div>
                <h2 className="mb-1 text-sm font-bold border-b border-gray-400 pb-0.5">頻発 NG 項目（Top 10）</h2>
                {topItems.length === 0
                  ? <p className="text-xs text-gray-400 py-2">NG なし</p>
                  : (
                    <table className="w-full text-[8.5pt]">
                      <tbody>
                        {topItems.map((it, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-0.5 pr-2">
                              {it.isImportant && <span className="mr-1 text-red-700">★</span>}
                              {it.text}
                            </td>
                            <td className="py-0.5 text-right font-medium text-red-700 tabular-nums">{it.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            </section>
          </div>

          <div className="mt-2 text-[8pt] text-gray-400 text-right">— 1 / 2 —</div>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* 裏面 */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="pdf-page">
          {/* ヘッダー（簡易） */}
          <div className="flex items-end justify-between border-b border-gray-400 pb-1 mb-3">
            <h1 className="text-base font-bold">パトロール実施報告書 — 是正アクション・NG 詳細</h1>
            <div className="text-[10px] text-gray-600">
              期間: {fromStr} 〜 {toStr} / {orgName}
            </div>
          </div>

          {/* 担当者別 是正状況 */}
          <section className="mb-3">
            <h2 className="mb-1 text-sm font-bold border-b border-gray-400 pb-0.5">
              担当者別 是正アクション集計
            </h2>
            {caAssigneeStats.size === 0
              ? <p className="text-xs text-gray-400 py-2">是正アクションがありません</p>
              : (
                <table className="w-full text-[8.5pt] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-100">
                      <th className="px-1 py-0.5 text-left">担当者</th>
                      <th className="px-1 py-0.5 text-right w-16">未着手</th>
                      <th className="px-1 py-0.5 text-right w-16">対応中</th>
                      <th className="px-1 py-0.5 text-right w-16">完了</th>
                      <th className="px-1 py-0.5 text-right w-20">期限超過</th>
                      <th className="px-1 py-0.5 text-right w-16">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(caAssigneeStats.entries())
                      .sort((a, b) => (b[1].open + b[1].inProg + b[1].done) - (a[1].open + a[1].inProg + a[1].done))
                      .map(([aid, st]) => (
                        <tr key={aid} className="border-b border-gray-100">
                          <td className="px-1 py-0.5">{nameMap.get(aid) ?? aid}</td>
                          <td className={`px-1 py-0.5 text-right tabular-nums ${st.open > 0 ? 'font-bold' : ''}`}>{st.open || '–'}</td>
                          <td className={`px-1 py-0.5 text-right tabular-nums ${st.inProg > 0 ? 'font-bold text-blue-700' : ''}`}>{st.inProg || '–'}</td>
                          <td className={`px-1 py-0.5 text-right tabular-nums ${st.done > 0 ? 'text-green-700' : ''}`}>{st.done || '–'}</td>
                          <td className={`px-1 py-0.5 text-right tabular-nums ${st.overdue > 0 ? 'font-bold text-red-700' : ''}`}>{st.overdue || '–'}</td>
                          <td className="px-1 py-0.5 text-right tabular-nums font-medium">{st.open + st.inProg + st.done}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
          </section>

          {/* 是正アクション一覧 */}
          <section className="mb-3">
            <h2 className="mb-1 text-sm font-bold border-b border-gray-400 pb-0.5">
              是正アクション一覧（{cas.length} 件）
              {caOverdue > 0 && <span className="ml-2 text-xs text-red-700 font-normal">期限超過: {caOverdue} 件</span>}
            </h2>
            {caDetailList.length === 0
              ? <p className="text-xs text-gray-400 py-2">是正アクションがありません</p>
              : (
                <table className="w-full text-[8pt] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-100">
                      <th className="px-1 py-0.5 text-left w-20">実施日</th>
                      <th className="px-1 py-0.5 text-left">現場</th>
                      <th className="px-1 py-0.5 text-left">NG項目</th>
                      <th className="px-1 py-0.5 text-left w-24">担当者</th>
                      <th className="px-1 py-0.5 text-left w-20">期限</th>
                      <th className="px-1 py-0.5 text-center w-16">状況</th>
                      <th className="px-1 py-0.5 text-left">コメント</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caDetailList.map((c, i) => (
                      <tr key={i} className={`border-b border-gray-100 ${c.overdue ? 'bg-red-50' : ''}`}>
                        <td className="px-1 py-0.5 whitespace-nowrap">{c.date}</td>
                        <td className="px-1 py-0.5 truncate max-w-[10em]">{c.site}</td>
                        <td className="px-1 py-0.5 truncate max-w-[18em]">{c.item}</td>
                        <td className="px-1 py-0.5 truncate max-w-[7em]">{c.assignee}</td>
                        <td className={`px-1 py-0.5 whitespace-nowrap ${c.overdue ? 'font-bold text-red-700' : ''}`}>
                          {c.dueDate || '—'}{c.overdue && ' ⚠'}
                        </td>
                        <td className="px-1 py-0.5 text-center text-[7.5pt]">
                          {CORRECTIVE_STATUS_LABEL[c.status as CorrectiveActionStatus] ?? c.status}
                        </td>
                        <td className="px-1 py-0.5 truncate max-w-[20em] text-gray-600">{c.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </section>

          {/* NG項目詳細リスト */}
          <section>
            <h2 className="mb-1 text-sm font-bold border-b border-gray-400 pb-0.5">
              NG 項目詳細（{ngItemsDetail.length} 件）
            </h2>
            {ngItemsDetail.length === 0
              ? <p className="text-xs text-gray-400 py-2">NG 項目がありません</p>
              : (
                <table className="w-full text-[8pt] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-100">
                      <th className="px-1 py-0.5 text-left w-20">実施日</th>
                      <th className="px-1 py-0.5 text-left">現場</th>
                      <th className="px-1 py-0.5 text-left">カテゴリ</th>
                      <th className="px-1 py-0.5 text-left">NG項目</th>
                      <th className="px-1 py-0.5 text-left">指摘コメント</th>
                      <th className="px-1 py-0.5 text-left w-20">是正状況</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ngItemsDetail.map((n, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="px-1 py-0.5 whitespace-nowrap">{n.date}</td>
                        <td className="px-1 py-0.5 truncate max-w-[10em]">{n.site}</td>
                        <td className="px-1 py-0.5 truncate max-w-[12em] text-gray-600">{n.cat}</td>
                        <td className="px-1 py-0.5 truncate max-w-[20em]">
                          {n.important && <span className="mr-1 text-red-700">★</span>}
                          {n.text}
                        </td>
                        <td className="px-1 py-0.5 truncate max-w-[20em] text-gray-600">{n.comment || '—'}</td>
                        <td className="px-1 py-0.5 text-[7.5pt]">
                          {n.ca
                            ? CORRECTIVE_STATUS_LABEL[n.ca.status as CorrectiveActionStatus] ?? n.ca.status
                            : <span className="text-gray-400">未割当</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </section>

          <div className="mt-2 text-[8pt] text-gray-400 text-right">— 2 / 2 —</div>
        </div>
      </div>
    </>
  )
}

function Kpi({
  label,
  value,
  subValue,
  color,
}: {
  label: string
  value: number | string
  subValue?: string
  color?: 'green' | 'red' | 'amber' | 'blue'
}) {
  const colorClass =
    color === 'green' ? 'text-green-700 border-green-300 bg-green-50' :
    color === 'red'   ? 'text-red-700 border-red-300 bg-red-50' :
    color === 'amber' ? 'text-amber-700 border-amber-300 bg-amber-50' :
    color === 'blue'  ? 'text-blue-700 border-blue-300 bg-blue-50' :
    'text-gray-800 border-gray-300 bg-gray-50'
  return (
    <div className={`border rounded px-1.5 py-1 ${colorClass}`}>
      <p className="text-[8pt] text-gray-600 leading-tight">{label}</p>
      <p className="text-lg font-bold leading-tight tabular-nums">{value}</p>
      {subValue && <p className="text-[8pt] leading-tight">{subValue}</p>}
    </div>
  )
}
