'use server'

/**
 * チェック項目の CSV 一括ダウンロード / アップロード
 *
 * 仕様:
 *   - エクスポート: 現状の項目を BOM 付き UTF-8 CSV で返す
 *   - インポート: id ベースで diff を計算
 *       - id 一致 → 更新
 *       - id 空 → 新規追加
 *       - 既存にあって CSV に無い → 論理削除（is_active=false）
 *   - プレビュー → 適用 の 2 段階
 *   - 適用後にテンプレートのバージョンを bump
 */

import { getAdminSupabase } from '@/sdk'
const supabaseAdmin = getAdminSupabase()
import { revalidatePath } from 'next/cache'
import { requirePatrolAdminAction as requireOrgAccess } from '../../../_helpers/patrolRole'

const CSV_HEADERS = [
  'id',
  'sort_order',
  'category1',
  'category2',
  'category3',
  'item_text',
  'is_important',
  'display_style',
  'weight',
  'regulation_ref',
  'input_type',
] as const

type CsvField = (typeof CSV_HEADERS)[number]

type ItemRow = {
  id?:              string
  sort_order:       number
  category1:        string
  category2:        string
  category3:        string
  item_text:        string
  is_important:    boolean
  display_style:    string
  weight:           number
  regulation_ref:   string | null
  input_type:       string
}

const VALID_DISPLAY_STYLES = ['normal', 'important_red', 'important_bold', 'critical']
const VALID_INPUT_TYPES = ['result_only', 'result_with_number', 'result_with_text', 'result_with_choices']

// ─── CSV エンコード ────────────────────────────────────────
function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // ", カンマ, 改行を含む場合はダブルクォートで囲み、内部の " はエスケープ
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowsToCsv(rows: ItemRow[]): string {
  const headerLine = CSV_HEADERS.map(escapeCsvField).join(',')
  const dataLines = rows.map(r => CSV_HEADERS.map(h => {
    const v = (r as unknown as Record<CsvField, unknown>)[h]
    if (h === 'is_important') return r.is_important ? 'true' : 'false'
    return escapeCsvField(v as string | number | boolean | null | undefined)
  }).join(','))
  return [headerLine, ...dataLines].join('\r\n')
}

// ─── CSV パース ───────────────────────────────────────────
// シンプルなパーサ: ダブルクォート対応 + カンマ/改行 escape
function parseCsv(text: string): string[][] {
  // BOM 除去
  const cleaned = text.replace(/^﻿/, '')
  const result: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < cleaned.length) {
    const c = cleaned[i]
    if (inQuotes) {
      if (c === '"') {
        if (cleaned[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { row.push(field); result.push(row); row = []; field = ''; i++; continue }
    field += c
    i++
  }
  // 末尾
  if (field !== '' || row.length > 0) {
    row.push(field)
    result.push(row)
  }
  return result
}

function parseRowToItem(headers: string[], values: string[]): { ok: true; item: ItemRow } | { ok: false; error: string } {
  const get = (key: string): string => {
    const idx = headers.indexOf(key)
    return idx >= 0 ? (values[idx] ?? '').trim() : ''
  }
  const item_text = get('item_text')
  if (!item_text) return { ok: false, error: 'item_text 必須' }
  const sort_order = parseInt(get('sort_order') || '0', 10)
  const isImportantStr = get('is_important').toLowerCase()
  const is_important = isImportantStr === 'true' || isImportantStr === '1' || isImportantStr === 'yes'
  let display_style = get('display_style') || 'normal'
  if (!VALID_DISPLAY_STYLES.includes(display_style)) display_style = 'normal'
  const weight = Number.isFinite(Number(get('weight'))) ? Number(get('weight')) : 1.0
  const regulation_ref = get('regulation_ref') || null
  let input_type = get('input_type') || 'result_only'
  if (!VALID_INPUT_TYPES.includes(input_type)) input_type = 'result_only'
  const id = get('id') || undefined
  return {
    ok: true,
    item: {
      id,
      sort_order: Number.isFinite(sort_order) ? sort_order : 0,
      category1: get('category1'),
      category2: get('category2'),
      category3: get('category3'),
      item_text,
      is_important,
      display_style,
      weight,
      regulation_ref,
      input_type,
    },
  }
}

// ─── エクスポート ──────────────────────────────────────────
export async function exportItemsCsvAction(
  slug: string,
  templateId: string,
): Promise<{ error?: string; csv?: string; filename?: string }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: tpl } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('id, name, organization_id, version')
    .eq('id', templateId)
    .single()
  if (!tpl || tpl.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートにアクセスする権限がありません' }
  }

  const { data: items } = await supabaseAdmin
    .from('patrol_items')
    .select('*')
    .eq('checklist_template_id', templateId)
    .eq('is_active', true)
    .order('sort_order')

  const rows: ItemRow[] = ((items ?? []) as Array<Record<string, unknown>>).map((it) => ({
    id:              it.id as string,
    sort_order:      (it.sort_order as number) ?? 0,
    category1:       (it.category1 as string) ?? '',
    category2:       (it.category2 as string) ?? '',
    category3:       (it.category3 as string) ?? '',
    item_text:       (it.item_text as string) ?? '',
    is_important:    (it.is_important as boolean) ?? false,
    display_style:   (it.display_style as string) ?? 'normal',
    weight:          (it.weight as number) ?? 1.0,
    regulation_ref:  (it.regulation_ref as string | null) ?? null,
    input_type:      (it.input_type as string) ?? 'result_only',
  }))

  const csv = '﻿' + rowsToCsv(rows)  // BOM 付き UTF-8
  const safeName = (tpl.name as string).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50)
  const filename = `checklist_${safeName}_v${tpl.version ?? 1}.csv`
  return { csv, filename }
}

// ─── インポート プレビュー ─────────────────────────────────
export type DiffPreview = {
  toAdd:    ItemRow[]
  toUpdate: Array<{ existing: ItemRow; next: ItemRow }>
  toDelete: ItemRow[]
  errors:   string[]
}

export async function previewCsvImportAction(
  slug: string,
  templateId: string,
  csvText: string,
): Promise<{ error?: string; preview?: DiffPreview }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: tpl } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('organization_id')
    .eq('id', templateId)
    .single()
  if (!tpl || tpl.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートにアクセスする権限がありません' }
  }

  const lines = parseCsv(csvText)
  if (lines.length === 0) return { error: 'CSV が空です' }

  const headers = lines[0].map(h => h.trim())
  if (!headers.includes('item_text')) {
    return { error: 'CSV ヘッダに item_text が必要です' }
  }

  const errors: string[] = []
  const csvItems: ItemRow[] = []
  for (let r = 1; r < lines.length; r++) {
    const values = lines[r]
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue
    const parsed = parseRowToItem(headers, values)
    if (!parsed.ok) { errors.push(`${r + 1}行目: ${parsed.error}`); continue }
    csvItems.push(parsed.item)
  }

  const { data: existingRaw } = await supabaseAdmin
    .from('patrol_items')
    .select('*')
    .eq('checklist_template_id', templateId)
    .eq('is_active', true)
  const existing: ItemRow[] = ((existingRaw ?? []) as Array<Record<string, unknown>>).map(it => ({
    id:              it.id as string,
    sort_order:      (it.sort_order as number) ?? 0,
    category1:       (it.category1 as string) ?? '',
    category2:       (it.category2 as string) ?? '',
    category3:       (it.category3 as string) ?? '',
    item_text:       (it.item_text as string) ?? '',
    is_important:    (it.is_important as boolean) ?? false,
    display_style:   (it.display_style as string) ?? 'normal',
    weight:          (it.weight as number) ?? 1.0,
    regulation_ref:  (it.regulation_ref as string | null) ?? null,
    input_type:      (it.input_type as string) ?? 'result_only',
  }))

  const existingById = new Map(existing.map(e => [e.id!, e]))
  const csvIdSet = new Set(csvItems.filter(c => c.id).map(c => c.id!))

  const toAdd: ItemRow[] = []
  const toUpdate: Array<{ existing: ItemRow; next: ItemRow }> = []
  for (const c of csvItems) {
    if (c.id && existingById.has(c.id)) {
      const e = existingById.get(c.id)!
      // 差分があるかチェック（フィールド単位の比較）
      const hasDiff = (
        e.sort_order !== c.sort_order ||
        e.category1 !== c.category1 ||
        e.category2 !== c.category2 ||
        e.category3 !== c.category3 ||
        e.item_text !== c.item_text ||
        e.is_important !== c.is_important ||
        e.display_style !== c.display_style ||
        e.weight !== c.weight ||
        e.regulation_ref !== c.regulation_ref ||
        e.input_type !== c.input_type
      )
      if (hasDiff) toUpdate.push({ existing: e, next: c })
    } else {
      // id が空 or 既存にない → 新規追加（id があっても新規として扱う場合は捨てる）
      toAdd.push({ ...c, id: undefined })
    }
  }
  const toDelete = existing.filter(e => !csvIdSet.has(e.id!))

  return { preview: { toAdd, toUpdate, toDelete, errors } }
}

// ─── インポート 適用 ───────────────────────────────────────
export async function applyCsvImportAction(
  slug: string,
  templateId: string,
  csvText: string,
): Promise<{ error?: string; added?: number; updated?: number; deleted?: number }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // 再度 preview を計算（race を避ける + ガード重ねがけ）
  const previewRes = await previewCsvImportAction(slug, templateId, csvText)
  if (previewRes.error || !previewRes.preview) return { error: previewRes.error ?? 'プレビュー生成に失敗' }
  const { toAdd, toUpdate, toDelete, errors } = previewRes.preview
  if (errors.length > 0) return { error: errors.join('\n') }

  // 追加
  if (toAdd.length > 0) {
    const rows = toAdd.map(c => ({
      organization_id:       actor.organizationId,
      checklist_template_id: templateId,
      category1:             c.category1,
      category2:             c.category2,
      category3:             c.category3,
      item_text:             c.item_text,
      sort_order:            c.sort_order,
      is_important:          c.is_important,
      display_style:         c.display_style,
      weight:                c.weight,
      regulation_ref:        c.regulation_ref,
      input_type:            c.input_type,
      is_active:             true,
    }))
    const { error: insErr } = await supabaseAdmin.from('patrol_items').insert(rows)
    if (insErr) return { error: `追加に失敗: ${insErr.message}` }
  }

  // 更新
  for (const { existing, next } of toUpdate) {
    const { error: updErr } = await supabaseAdmin
      .from('patrol_items')
      .update({
        category1:      next.category1,
        category2:      next.category2,
        category3:      next.category3,
        item_text:      next.item_text,
        sort_order:     next.sort_order,
        is_important:   next.is_important,
        display_style:  next.display_style,
        weight:         next.weight,
        regulation_ref: next.regulation_ref,
        input_type:     next.input_type,
      })
      .eq('id', existing.id!)
    if (updErr) return { error: `更新に失敗 (${existing.id}): ${updErr.message}` }
  }

  // 削除（論理: is_active=false）
  if (toDelete.length > 0) {
    const ids = toDelete.map(d => d.id!).filter(Boolean)
    const { error: delErr } = await supabaseAdmin
      .from('patrol_items')
      .update({ is_active: false })
      .in('id', ids)
    if (delErr) return { error: `削除に失敗: ${delErr.message}` }
  }

  // テンプレートのバージョン bump（既存シートとの整合性のため）
  if (toAdd.length + toUpdate.length + toDelete.length > 0) {
    const { data: cur } = await supabaseAdmin
      .from('patrol_checklist_templates')
      .select('version')
      .eq('id', templateId)
      .single()
    const newVersion = ((cur?.version as number | null) ?? 1) + 1
    await supabaseAdmin
      .from('patrol_checklist_templates')
      .update({ version: newVersion })
      .eq('id', templateId)
  }

  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/checklists/${templateId}`)
  return {
    added:   toAdd.length,
    updated: toUpdate.length,
    deleted: toDelete.length,
  }
}
