import { notFound } from 'next/navigation'
import { createServerSupabase as createClient } from '@/sdk'
import { getAdminSupabase } from '@/sdk'
const supabaseAdmin = getAdminSupabase()
import { requireActor as requireOrgAccess } from '@/sdk'
import { AutoPrint } from './AutoPrint'
import {
  SHEET_STATUS_LABEL,
  RESULT_LABEL,
  type PatrolCheckSheet,
  type PatrolSheetItem,
  type PatrolSheetStep,
  type PatrolSheetStatus,
  type PatrolItemResult,
  type DisplayStyle,
} from '../../../_types'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ auto?: string; size?: string }>

// display_style → CSS クラス（印刷用）
const DISPLAY_STYLE_CLASS: Record<DisplayStyle, string> = {
  normal:          '',
  important_red:   'text-red-700',
  important_bold:  'font-bold',
  critical:        'font-bold text-red-700 bg-red-100',
}

export default async function PatrolPrintPage({
  params,
  searchParams,
}: {
  params:        Promise<{ slug: string; sheetId: string }>
  searchParams:  SearchParams
}) {
  const { slug, sheetId } = await params
  const { auto, size } = await searchParams
  const isA3 = size === 'a3'

  // 認可
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) notFound()
  const { actor } = guard

  // シート＋関連データ
  const { data: sheet } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('*')
    .eq('id', sheetId)
    .single()
  if (!sheet) notFound()
  const typedSheet = sheet as PatrolCheckSheet
  if (typedSheet.organization_id !== actor.organizationId) notFound()

  const supabase = await createClient()
  void supabase

  const [checklistRes, workflowRes, itemsRes, stepsRes, patrollerRes, orgRes, commentsRes] = await Promise.all([
    supabaseAdmin.from('patrol_checklist_templates').select('id, name').eq('id', typedSheet.checklist_template_id).single(),
    supabaseAdmin.from('patrol_workflow_templates').select('id, name').eq('id', typedSheet.workflow_template_id).single(),
    supabaseAdmin.from('patrol_sheet_items').select('*').eq('sheet_id', sheetId).order('sort_order'),
    supabaseAdmin.from('patrol_sheet_steps').select('*').eq('sheet_id', sheetId).order('step_order'),
    supabaseAdmin.from('profiles').select('display_name').eq('id', typedSheet.patroller_id).single(),
    supabaseAdmin.from('organizations').select('name').eq('id', typedSheet.organization_id).single(),
    supabaseAdmin.from('patrol_sheet_comments').select('id, author_name_snapshot, body, mentioned_user_names, requires_response, resolved_at, created_at').eq('sheet_id', sheetId).order('created_at'),
  ])
  const orgName = (orgRes.data as { name?: string } | null)?.name ?? ''

  type CommentRow = {
    id:                    string
    author_name_snapshot:  string
    body:                  string
    mentioned_user_names:  string[]
    requires_response:     boolean
    resolved_at:           string | null
    created_at:            string
  }
  const comments = (commentsRes.data ?? []) as CommentRow[]

  const items = (itemsRes.data ?? []) as PatrolSheetItem[]
  const steps = (stepsRes.data ?? []) as PatrolSheetStep[]

  const assigneeIds = steps.map(s => s.assignee_id).filter((x): x is string => x !== null)
  const profileMap = new Map<string, string>()
  if (assigneeIds.length > 0) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('id, display_name').in('id', assigneeIds)
    for (const p of profs ?? []) profileMap.set(p.id, p.display_name)
  }

  // 写真の signed URL
  const photoUrlMap = new Map<string, string>()
  const allPhotoPaths = items.flatMap(i => i.photo_urls ?? [])
  if (allPhotoPaths.length > 0) {
    const safe = allPhotoPaths.filter(p => p.startsWith(`${typedSheet.organization_id}/${sheetId}/`) && !p.includes('..'))
    for (const p of safe) {
      const { data } = await supabaseAdmin.storage
        .from('patrol-attachments')
        .createSignedUrl(p, 60 * 60) // 印刷用は 1 時間
      if (data?.signedUrl) photoUrlMap.set(p, data.signedUrl)
    }
  }

  const groups = items.reduce<Record<string, PatrolSheetItem[]>>((acc, item) => {
    const key = item.category1
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const base = `/org/${slug}/apps/patrol-navi/patrols`
  const ngCount = items.filter(i => i.result === 'ng').length

  return (
    <div className="bg-white text-black">
      <AutoPrint backHref={`${base}/${sheetId}`} autoPrint={auto === '1'} />

      <style>{`
        @page { size: ${isA3 ? 'A3 landscape' : 'A4'}; margin: 12mm; }
        @media print {
          html, body { background: white !important; }
          aside, nav, header, [data-slot="sidebar"], .print\\:hidden { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
          .print-page { box-shadow: none !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className={`print-page mx-auto p-8 print:p-0 ${isA3 ? 'max-w-[420mm]' : 'max-w-[210mm]'}`}>
        {/* タイトル + 用紙サイズ切替（画面のみ） */}
        <div className="mb-2 flex items-center justify-end gap-2 print:hidden">
          <span className="text-xs text-gray-500">用紙:</span>
          <a
            href={`?auto=${auto ?? '0'}`}
            className={`rounded border px-2 py-0.5 text-xs ${!isA3 ? 'border-black bg-black text-white' : 'border-gray-300 bg-white'}`}
          >A4 縦</a>
          <a
            href={`?auto=${auto ?? '0'}&size=a3`}
            className={`rounded border px-2 py-0.5 text-xs ${isA3 ? 'border-black bg-black text-white' : 'border-gray-300 bg-white'}`}
          >A3 横</a>
        </div>

        <div className="mb-6 border-b-2 border-black pb-3">
          {orgName && (
            <p className="text-xs tracking-wider text-gray-700">{orgName}</p>
          )}
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-bold tracking-wide">安全パトロール記録</h1>
            <span className="text-xs">
              ステータス: {SHEET_STATUS_LABEL[typedSheet.status as PatrolSheetStatus]}
            </span>
          </div>
        </div>

        {/* 基本情報テーブル */}
        <table className="mb-5 w-full border-collapse text-sm avoid-break">
          <tbody>
            <tr>
              <th className="w-28 border border-black bg-gray-100 px-2 py-1.5 text-left font-medium">実施日</th>
              <td className="border border-black px-2 py-1.5">{typedSheet.patrol_date?.slice(0, 10)}</td>
              <th className="w-28 border border-black bg-gray-100 px-2 py-1.5 text-left font-medium">パトロール者</th>
              <td className="border border-black px-2 py-1.5">{patrollerRes.data?.display_name ?? '—'}</td>
            </tr>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1.5 text-left font-medium">現場名</th>
              <td className="border border-black px-2 py-1.5">{typedSheet.site_name}</td>
              <th className="border border-black bg-gray-100 px-2 py-1.5 text-left font-medium">クルー</th>
              <td className="border border-black px-2 py-1.5">{typedSheet.crew_name ?? '—'}</td>
            </tr>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1.5 text-left font-medium">チェックリスト</th>
              <td className="border border-black px-2 py-1.5">{checklistRes.data?.name ?? '—'}</td>
              <th className="border border-black bg-gray-100 px-2 py-1.5 text-left font-medium">ワークフロー</th>
              <td className="border border-black px-2 py-1.5">{workflowRes.data?.name ?? '—'}</td>
            </tr>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1.5 text-left font-medium">入力件数</th>
              <td className="border border-black px-2 py-1.5">
                {items.filter(i => i.result !== null).length} / {items.length} 件
                {ngCount > 0 && <span className="ml-3 font-bold text-red-700">NG: {ngCount} 件</span>}
              </td>
              <th className="border border-black bg-gray-100 px-2 py-1.5 text-left font-medium">出力日時</th>
              <td className="border border-black px-2 py-1.5">{new Date().toLocaleString('ja-JP')}</td>
            </tr>
          </tbody>
        </table>

        {/* 承認フロー */}
        <h2 className="mb-2 text-base font-bold">承認フロー</h2>
        <table className="mb-5 w-full border-collapse text-sm avoid-break">
          <thead>
            <tr className="bg-gray-100">
              <th className="w-12 border border-black px-2 py-1 text-left font-medium">#</th>
              <th className="border border-black px-2 py-1 text-left font-medium">ステップ</th>
              <th className="w-32 border border-black px-2 py-1 text-left font-medium">担当者</th>
              <th className="w-24 border border-black px-2 py-1 text-left font-medium">状態</th>
              <th className="w-36 border border-black px-2 py-1 text-left font-medium">処理日時</th>
              <th className="border border-black px-2 py-1 text-left font-medium">コメント</th>
            </tr>
          </thead>
          <tbody>
            {steps.map(step => (
              <tr key={step.id}>
                <td className="border border-black px-2 py-1">{step.step_order}</td>
                <td className="border border-black px-2 py-1">{step.step_name}</td>
                <td className="border border-black px-2 py-1">
                  {step.assignee_id ? profileMap.get(step.assignee_id) ?? '—' : '—'}
                </td>
                <td className="border border-black px-2 py-1">
                  {step.status === 'approved' ? '承認' : step.status === 'remanded' ? '差戻し' : '保留'}
                </td>
                <td className="border border-black px-2 py-1">
                  {step.acted_at ? new Date(step.acted_at).toLocaleString('ja-JP') : '—'}
                </td>
                <td className="border border-black px-2 py-1">{step.comment ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 検査結果 */}
        <h2 className="mb-2 text-base font-bold">検査結果</h2>
        {Object.entries(groups).map(([cat, list]) => (
          <div key={cat} className="mb-4 avoid-break">
            <h3 className="mb-1 border-l-4 border-black pl-2 text-sm font-bold">{cat}</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="w-8 border border-black px-1 py-1 text-center font-medium">!</th>
                  <th className="w-24 border border-black px-2 py-1 text-left font-medium">中分類</th>
                  <th className="w-24 border border-black px-2 py-1 text-left font-medium">小分類</th>
                  <th className="border border-black px-2 py-1 text-left font-medium">点検項目</th>
                  <th className="w-12 border border-black px-1 py-1 text-center font-medium">結果</th>
                  <th className="border border-black px-2 py-1 text-left font-medium">コメント / 写真</th>
                </tr>
              </thead>
              <tbody>
                {list.map(item => {
                  const photos = (item.photo_urls ?? [])
                    .map(p => photoUrlMap.get(p))
                    .filter((u): u is string => Boolean(u))
                  const styleClass = DISPLAY_STYLE_CLASS[
                    ((item as { display_style?: string }).display_style ?? 'normal') as DisplayStyle
                  ]
                  const cat3 = (item as { category3?: string }).category3 ?? ''
                  const reg  = (item as { regulation_ref?: string | null }).regulation_ref
                  return (
                    <tr key={item.id} className="avoid-break">
                      <td className="border border-black px-1 py-1 text-center">
                        {item.is_important ? '★' : ''}
                      </td>
                      <td className="border border-black px-2 py-1 align-top">{item.category2}</td>
                      <td className="border border-black px-2 py-1 align-top">{cat3}</td>
                      <td className={`border border-black px-2 py-1 align-top ${styleClass}`}>
                        {item.item_text}
                        {reg && (
                          <div className="mt-0.5 text-[10px] font-normal text-gray-600">
                            📖 {reg}
                          </div>
                        )}
                      </td>
                      <td className={
                        'border border-black px-1 py-1 text-center align-top text-base font-bold ' +
                        (item.result === 'ng' ? 'text-red-700' : '')
                      }>
                        {item.result ? RESULT_LABEL[item.result as PatrolItemResult] : '—'}
                      </td>
                      <td className="border border-black px-2 py-1 align-top">
                        {item.comment ?? ''}
                        {photos.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {photos.map(url => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={url} src={url} alt="" className="h-20 w-20 border border-black object-cover" />
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* コメントスレッド */}
        {comments.length > 0 && (
          <div className="mt-4 avoid-break">
            <h2 className="mb-2 text-base font-bold">コメント / 質疑応答</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="w-32 border border-black px-2 py-1 text-left font-medium">投稿者</th>
                  <th className="w-32 border border-black px-2 py-1 text-left font-medium">日時</th>
                  <th className="w-20 border border-black px-2 py-1 text-left font-medium">状態</th>
                  <th className="border border-black px-2 py-1 text-left font-medium">内容</th>
                </tr>
              </thead>
              <tbody>
                {comments.map(c => (
                  <tr key={c.id} className="avoid-break">
                    <td className="border border-black px-2 py-1 align-top">{c.author_name_snapshot}</td>
                    <td className="border border-black px-2 py-1 align-top">
                      {new Date(c.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      {c.requires_response
                        ? (c.resolved_at ? '返答済' : '返答待ち')
                        : '—'}
                    </td>
                    <td className="border border-black px-2 py-1 align-top">
                      {c.mentioned_user_names.length > 0 && (
                        <div className="mb-1 text-[10px] text-gray-600">
                          @{c.mentioned_user_names.join(' @')}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{c.body}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* フィードバック */}
        {typedSheet.feedback && (
          <div className="mt-4 avoid-break">
            <h2 className="mb-1 text-base font-bold">フィードバック</h2>
            <p className="whitespace-pre-wrap rounded border border-black p-3 text-sm">
              {typedSheet.feedback}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
