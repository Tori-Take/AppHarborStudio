/**
 * シート Excel エクスポート API
 *
 * GET /org/[slug]/apps/patrol-navi/api/export/sheets?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 期間内のシートを Excel (xlsx) で返す。
 * 含まれるシート:
 *   - "Sheets":     パトロール一覧
 *   - "Items":      全項目の結果（行 = シート × 項目）
 *   - "NG":         NG 項目だけ抽出
 *   - "Workflow":   ワークフロー履歴（ステップ承認状況）
 */

import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAdminSupabase, requireActor as requireOrgAccess } from '@/sdk'
import {
  SHEET_STATUS_LABEL,
  RESULT_LABEL,
  type PatrolSheetStatus,
  type PatrolItemResult,
} from '../../../_types'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })
  const { actor } = guard
  const orgId = actor.organizationId

  const sp = request.nextUrl.searchParams
  const from = sp.get('from') ?? null
  const to   = sp.get('to')   ?? null

  const supabase = getAdminSupabase()

  // ─── シート ─────────────────────────────────────────
  type SheetRow = {
    id: string
    patrol_date: string
    site_name: string
    crew_name: string | null
    status: string
    current_step: number
    feedback: string | null
    patroller_id: string
    created_at: string
  }
  let q = supabase
    .from('patrol_check_sheets')
    .select('id, patrol_date, site_name, crew_name, status, current_step, feedback, patroller_id, created_at')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('patrol_date', { ascending: false })
  if (from) q = q.gte('patrol_date', from)
  if (to)   q = q.lte('patrol_date', to)
  const { data: sheetsRaw } = await q
  const sheets = (sheetsRaw ?? []) as SheetRow[]
  const sheetIds = sheets.map((s) => s.id)

  // patroller display_name 補完
  const patrollerIds = Array.from(new Set(sheets.map((s) => s.patroller_id)))
  const nameMap = new Map<string, string>()
  if (patrollerIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', patrollerIds)
    for (const p of (profs as Array<{ id: string; display_name: string | null }> | null) ?? []) {
      nameMap.set(p.id, p.display_name ?? p.id)
    }
  }

  // ─── 項目 ─────────────────────────────────────────
  type ItemRow = {
    sheet_id: string
    category1: string
    category2: string
    category3?: string
    item_text: string
    is_important: boolean
    result: string | null
    comment: string | null
  }
  let items: ItemRow[] = []
  if (sheetIds.length > 0) {
    const { data } = await supabase
      .from('patrol_sheet_items')
      .select('sheet_id, category1, category2, category3, item_text, is_important, result, comment')
      .in('sheet_id', sheetIds)
      .order('sort_order')
    items = (data as ItemRow[] | null) ?? []
  }

  // ─── ワークフローステップ ─────────────────────────
  type StepRow = {
    sheet_id: string
    step_order: number
    step_name: string
    step_type: string | null
    status: string
    comment: string | null
    acted_at: string | null
    assignee_id: string | null
    assignee_user_name_snapshot?: string | null
  }
  let steps: StepRow[] = []
  if (sheetIds.length > 0) {
    const { data } = await supabase
      .from('patrol_sheet_steps')
      .select('sheet_id, step_order, step_name, step_type, status, comment, acted_at, assignee_id, assignee_user_name_snapshot')
      .in('sheet_id', sheetIds)
      .order('step_order')
    steps = (data as StepRow[] | null) ?? []
  }

  // ─── Excel 組み立て ────────────────────────────────
  const wb = XLSX.utils.book_new()

  // Sheet: シート一覧
  const sheetsTable = sheets.map((s) => ({
    'シート ID':    s.id,
    '実施日':       s.patrol_date.slice(0, 10),
    '現場名':       s.site_name,
    'クルー名':     s.crew_name ?? '',
    'ステータス':   SHEET_STATUS_LABEL[s.status as PatrolSheetStatus] ?? s.status,
    '現在ステップ': s.current_step,
    'パトロール者': nameMap.get(s.patroller_id) ?? s.patroller_id,
    '所感':         s.feedback ?? '',
    '作成日時':     s.created_at,
  }))
  const wsSheets = XLSX.utils.json_to_sheet(sheetsTable)
  XLSX.utils.book_append_sheet(wb, wsSheets, 'Sheets')

  // Sheet: 項目（全件）
  const sheetByIdMap = new Map(sheets.map((s) => [s.id, s]))
  const itemsTable = items.map((it) => {
    const s = sheetByIdMap.get(it.sheet_id)
    return {
      '実施日':     s?.patrol_date.slice(0, 10) ?? '',
      '現場名':     s?.site_name ?? '',
      'カテゴリ1':  it.category1,
      'カテゴリ2':  it.category2,
      'カテゴリ3':  it.category3 ?? '',
      '項目内容':   it.item_text,
      '重要':       it.is_important ? '★' : '',
      '結果':       it.result ? RESULT_LABEL[it.result as PatrolItemResult] : '未入力',
      'コメント':   it.comment ?? '',
    }
  })
  const wsItems = XLSX.utils.json_to_sheet(itemsTable)
  XLSX.utils.book_append_sheet(wb, wsItems, 'Items')

  // Sheet: NG だけ
  const ngTable = itemsTable.filter((r) => r['結果'] === '×')
  const wsNg = XLSX.utils.json_to_sheet(ngTable)
  XLSX.utils.book_append_sheet(wb, wsNg, 'NG')

  // Sheet: ワークフロー
  const stepsTable = steps.map((st) => {
    const s = sheetByIdMap.get(st.sheet_id)
    return {
      '実施日':     s?.patrol_date.slice(0, 10) ?? '',
      '現場名':     s?.site_name ?? '',
      'ステップ':   st.step_order,
      'ステップ名': st.step_name,
      '種別':       st.step_type ?? 'review',
      '担当者':     st.assignee_user_name_snapshot ?? (st.assignee_id ? nameMap.get(st.assignee_id) ?? '' : ''),
      'ステータス': st.status,
      'コメント':   st.comment ?? '',
      '実施日時':   st.acted_at ?? '',
    }
  })
  const wsSteps = XLSX.utils.json_to_sheet(stepsTable)
  XLSX.utils.book_append_sheet(wb, wsSteps, 'Workflow')

  // 出力
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const filename = `patrol-navi-${today}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
