/**
 * シート Excel エクスポート API
 *
 * GET /org/[slug]/apps/patrol-navi/api/export/sheets?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 期間内のシートを Excel (xlsx) で返す。
 * 含まれるシート:
 *   - "Sheets":     パトロール一覧（集計付き）
 *   - "Items":      全項目の結果（行 = シート × 項目）
 *   - "NG":         NG 項目 + 是正アクション結合
 *   - "是正":       是正アクション一覧
 *   - "Workflow":   ワークフロー履歴（ステップ承認状況）
 *   - "コメント":   スレッドコメント一覧
 */

import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAdminSupabase, requireActor as requireOrgAccess } from '@/sdk'
import {
  SHEET_STATUS_LABEL,
  RESULT_LABEL,
  CORRECTIVE_STATUS_LABEL,
  type PatrolSheetStatus,
  type PatrolItemResult,
  type CorrectiveActionStatus,
} from '../../../_types'

export const dynamic = 'force-dynamic'

const STEP_TYPE_LABEL: Record<string, string> = {
  review: '承認',
  comment: 'コメント',
  final_approve: '最終承認',
  notify: '閲覧',
}

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
    feedback_photo_urls: string[] | null
    patroller_id: string
    checklist_template_id: string
    workflow_template_id: string
    template_version: number | null
    created_at: string
    updated_at: string
  }
  let q = supabase
    .from('patrol_check_sheets')
    .select('*')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('patrol_date', { ascending: false })
  if (from) q = q.gte('patrol_date', from)
  if (to)   q = q.lte('patrol_date', to)
  const { data: sheetsRaw } = await q
  const sheets = (sheetsRaw ?? []) as SheetRow[]
  const sheetIds = sheets.map((s) => s.id)

  // ─── テンプレート名 ────────────────────────────────
  const clIds = Array.from(new Set(sheets.map(s => s.checklist_template_id)))
  const wfIds = Array.from(new Set(sheets.map(s => s.workflow_template_id)))
  const clNameMap = new Map<string, string>()
  const wfNameMap = new Map<string, string>()
  if (clIds.length > 0) {
    const { data } = await supabase.from('patrol_checklist_templates').select('id, name').in('id', clIds)
    for (const r of data ?? []) clNameMap.set(r.id as string, r.name as string)
  }
  if (wfIds.length > 0) {
    const { data } = await supabase.from('patrol_workflow_templates').select('id, name').in('id', wfIds)
    for (const r of data ?? []) wfNameMap.set(r.id as string, r.name as string)
  }

  // ─── プロフィール（全組織メンバー） ──────────────────
  const nameMap = new Map<string, string>()
  const { data: allProfs } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('organization_id', orgId)
  for (const p of (allProfs ?? []) as Array<{ id: string; display_name: string | null }>) {
    nameMap.set(p.id, p.display_name ?? p.id)
  }

  // ─── 項目 ─────────────────────────────────────────
  type ItemRow = {
    id: string
    sheet_id: string
    sort_order: number
    category1: string
    category2: string
    category3: string | null
    item_text: string
    is_important: boolean
    result: string | null
    comment: string | null
    photo_urls: string[] | null
    display_style: string | null
    regulation_ref: string | null
  }
  let items: ItemRow[] = []
  if (sheetIds.length > 0) {
    const { data } = await supabase
      .from('patrol_sheet_items')
      .select('*')
      .in('sheet_id', sheetIds)
      .order('sort_order')
    items = (data as ItemRow[] | null) ?? []
  }

  // ─── 是正アクション ────────────────────────────────
  type CARow = {
    id: string
    sheet_item_id: string
    assignee_id: string
    due_date: string | null
    status: string
    comment: string | null
    created_by: string
    created_at: string
    completed_at: string | null
    completion_note: string | null
  }
  const itemIds = items.map(i => i.id)
  let correctiveActions: CARow[] = []
  if (itemIds.length > 0) {
    const { data } = await supabase
      .from('patrol_corrective_actions')
      .select('*')
      .in('sheet_item_id', itemIds)
      .order('created_at')
    correctiveActions = (data as CARow[] | null) ?? []
  }
  const caByItemId = new Map<string, CARow[]>()
  for (const ca of correctiveActions) {
    const arr = caByItemId.get(ca.sheet_item_id) ?? []
    arr.push(ca)
    caByItemId.set(ca.sheet_item_id, arr)
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
    assignee_user_name_snapshot: string | null
    assignee_role_label_snapshot: string | null
  }
  let steps: StepRow[] = []
  if (sheetIds.length > 0) {
    const { data } = await supabase
      .from('patrol_sheet_steps')
      .select('*')
      .in('sheet_id', sheetIds)
      .order('step_order')
    steps = (data as StepRow[] | null) ?? []
  }

  // ─── コメントスレッド ─────────────────────────────
  type CommentRow = {
    id: string
    sheet_id: string
    author_id: string
    body: string
    mentions: string[] | null
    created_at: string
  }
  let comments: CommentRow[] = []
  if (sheetIds.length > 0) {
    const { data } = await supabase
      .from('patrol_sheet_comments')
      .select('*')
      .in('sheet_id', sheetIds)
      .order('created_at')
    comments = (data as CommentRow[] | null) ?? []
  }

  // ─── 集計用マップ ─────────────────────────────────
  const sheetByIdMap = new Map(sheets.map((s) => [s.id, s]))
  const itemsBySheet = new Map<string, ItemRow[]>()
  for (const it of items) {
    const arr = itemsBySheet.get(it.sheet_id) ?? []
    arr.push(it)
    itemsBySheet.set(it.sheet_id, arr)
  }
  // item → sheet マップ
  const itemToSheet = new Map<string, SheetRow>()
  for (const it of items) {
    const s = sheetByIdMap.get(it.sheet_id)
    if (s) itemToSheet.set(it.id, s)
  }

  // ─── Excel 組み立て ────────────────────────────────
  const wb = XLSX.utils.book_new()

  // 1. Sheets: シート一覧（集計付き）
  const sheetsTable = sheets.map((s) => {
    const si = itemsBySheet.get(s.id) ?? []
    const okCount   = si.filter(i => i.result === 'ok').length
    const ngCount   = si.filter(i => i.result === 'ng').length
    const noneCount = si.filter(i => i.result === 'none').length
    const nullCount = si.filter(i => i.result === null).length
    const photoCount = si.reduce((n, i) => n + (i.photo_urls?.length ?? 0), 0) + (s.feedback_photo_urls?.length ?? 0)
    return {
      'シート ID':      s.id,
      '実施日':         s.patrol_date.slice(0, 10),
      '現場名':         s.site_name,
      'クルー名':       s.crew_name ?? '',
      'パトロール者':   nameMap.get(s.patroller_id) ?? s.patroller_id,
      'ステータス':     SHEET_STATUS_LABEL[s.status as PatrolSheetStatus] ?? s.status,
      'チェックリスト': clNameMap.get(s.checklist_template_id) ?? '',
      'テンプレVer':    s.template_version ?? '',
      'ワークフロー':   wfNameMap.get(s.workflow_template_id) ?? '',
      '総項目数':       si.length,
      'OK':             okCount,
      'NG':             ngCount,
      '該当なし':       noneCount,
      '未入力':         nullCount,
      '完了率':         si.length > 0 ? `${Math.round(((okCount + ngCount + noneCount) / si.length) * 100)}%` : '',
      '写真枚数':       photoCount,
      '所感':           s.feedback ?? '',
      '作成日時':       s.created_at,
      '更新日時':       s.updated_at,
    }
  })
  const wsSheets = XLSX.utils.json_to_sheet(sheetsTable)
  XLSX.utils.book_append_sheet(wb, wsSheets, 'Sheets')

  // 2. Items: 項目（全件）
  const itemsTable = items.map((it) => {
    const s = sheetByIdMap.get(it.sheet_id)
    return {
      '実施日':       s?.patrol_date.slice(0, 10) ?? '',
      '現場名':       s?.site_name ?? '',
      'クルー名':     s?.crew_name ?? '',
      'パトロール者': s ? (nameMap.get(s.patroller_id) ?? '') : '',
      '並び順':       it.sort_order,
      'カテゴリ1':    it.category1,
      'カテゴリ2':    it.category2,
      'カテゴリ3':    it.category3 ?? '',
      '項目内容':     it.item_text,
      '重要':         it.is_important ? '★' : '',
      '表示スタイル': it.display_style ?? '',
      '根拠法令':     it.regulation_ref ?? '',
      '結果':         it.result ? RESULT_LABEL[it.result as PatrolItemResult] : '未入力',
      'コメント':     it.comment ?? '',
      '写真枚数':     it.photo_urls?.length ?? 0,
      'シート ID':    it.sheet_id,
      '項目 ID':      it.id,
    }
  })
  const wsItems = XLSX.utils.json_to_sheet(itemsTable)
  XLSX.utils.book_append_sheet(wb, wsItems, 'Items')

  // 3. NG: NG 項目 + 是正アクション結合
  const ngItems = items.filter(it => it.result === 'ng')
  const ngTable = ngItems.flatMap((it) => {
    const s = sheetByIdMap.get(it.sheet_id)
    const cas = caByItemId.get(it.id) ?? []
    const base = {
      '実施日':       s?.patrol_date.slice(0, 10) ?? '',
      '現場名':       s?.site_name ?? '',
      'クルー名':     s?.crew_name ?? '',
      'パトロール者': s ? (nameMap.get(s.patroller_id) ?? '') : '',
      'カテゴリ1':    it.category1,
      'カテゴリ2':    it.category2,
      'カテゴリ3':    it.category3 ?? '',
      '項目内容':     it.item_text,
      '重要':         it.is_important ? '★' : '',
      'コメント':     it.comment ?? '',
      '写真枚数':     it.photo_urls?.length ?? 0,
    }
    if (cas.length === 0) {
      return [{ ...base, '是正担当': '', '是正期限': '', '是正ステータス': '', '是正コメント': '', '完了日': '', '完了メモ': '' }]
    }
    return cas.map(ca => ({
      ...base,
      '是正担当':       nameMap.get(ca.assignee_id) ?? ca.assignee_id,
      '是正期限':       ca.due_date ?? '',
      '是正ステータス': CORRECTIVE_STATUS_LABEL[ca.status as CorrectiveActionStatus] ?? ca.status,
      '是正コメント':   ca.comment ?? '',
      '完了日':         ca.completed_at ?? '',
      '完了メモ':       ca.completion_note ?? '',
    }))
  })
  const wsNg = XLSX.utils.json_to_sheet(ngTable)
  XLSX.utils.book_append_sheet(wb, wsNg, 'NG')

  // 4. 是正アクション一覧
  const caTable = correctiveActions.map(ca => {
    const parentItem = items.find(i => i.id === ca.sheet_item_id)
    const s = parentItem ? sheetByIdMap.get(parentItem.sheet_id) : undefined
    return {
      '実施日':       s?.patrol_date.slice(0, 10) ?? '',
      '現場名':       s?.site_name ?? '',
      'NG 項目':      parentItem?.item_text ?? '',
      'カテゴリ':     parentItem ? `${parentItem.category1} > ${parentItem.category2}` : '',
      '担当者':       nameMap.get(ca.assignee_id) ?? ca.assignee_id,
      '期限':         ca.due_date ?? '',
      'ステータス':   CORRECTIVE_STATUS_LABEL[ca.status as CorrectiveActionStatus] ?? ca.status,
      'コメント':     ca.comment ?? '',
      '作成者':       nameMap.get(ca.created_by) ?? ca.created_by,
      '作成日時':     ca.created_at,
      '完了日':       ca.completed_at ?? '',
      '完了メモ':     ca.completion_note ?? '',
      '是正 ID':      ca.id,
    }
  })
  const wsCa = XLSX.utils.json_to_sheet(caTable.length > 0 ? caTable : [{}])
  XLSX.utils.book_append_sheet(wb, wsCa, '是正')

  // 5. Workflow: ワークフロー履歴
  const stepsTable = steps.map((st) => {
    const s = sheetByIdMap.get(st.sheet_id)
    return {
      '実施日':     s?.patrol_date.slice(0, 10) ?? '',
      '現場名':     s?.site_name ?? '',
      'ステップ':   st.step_order,
      'ステップ名': st.step_name,
      '種別':       STEP_TYPE_LABEL[st.step_type ?? 'review'] ?? st.step_type ?? '',
      '担当者':     st.assignee_user_name_snapshot ?? (st.assignee_id ? nameMap.get(st.assignee_id) ?? '' : ''),
      '役割':       st.assignee_role_label_snapshot ?? '',
      'ステータス': st.status,
      'コメント':   st.comment ?? '',
      '実施日時':   st.acted_at ?? '',
      'シート ID':  st.sheet_id,
    }
  })
  const wsSteps = XLSX.utils.json_to_sheet(stepsTable)
  XLSX.utils.book_append_sheet(wb, wsSteps, 'Workflow')

  // 6. コメントスレッド
  const commentsTable = comments.map(c => {
    const s = sheetByIdMap.get(c.sheet_id)
    const mentionNames = (c.mentions ?? []).map(id => nameMap.get(id) ?? id).join(', ')
    return {
      '実施日':     s?.patrol_date.slice(0, 10) ?? '',
      '現場名':     s?.site_name ?? '',
      '投稿者':     nameMap.get(c.author_id) ?? c.author_id,
      '本文':       c.body,
      'メンション': mentionNames,
      '投稿日時':   c.created_at,
      'シート ID':  c.sheet_id,
    }
  })
  const wsComments = XLSX.utils.json_to_sheet(commentsTable.length > 0 ? commentsTable : [{}])
  XLSX.utils.book_append_sheet(wb, wsComments, 'コメント')

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
