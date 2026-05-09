'use server'

import { getAdminSupabase } from '@/sdk'
const supabaseAdmin = getAdminSupabase()
import { revalidatePath } from 'next/cache'
import { redirect }       from 'next/navigation'
import { requirePatrolAdminAction as requireOrgAccess } from '../../_helpers/patrolRole'

// テンプレート編集時に version を +1。スナップショットされたシートと
// 新規シート用テンプレートの差分を識別できるようにする。
async function bumpChecklistVersion(templateId: string, organizationId: string) {
  const { data } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('version')
    .eq('id', templateId)
    .eq('organization_id', organizationId)
    .single()
  const next = ((data?.version as number | null) ?? 1) + 1
  await supabaseAdmin
    .from('patrol_checklist_templates')
    .update({ version: next })
    .eq('id', templateId)
    .eq('organization_id', organizationId)
}

// チェックリストテンプレート作成
export async function createChecklistTemplateAction(
  slug: string,
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const name        = formData.get('name') as string
  const description = (formData.get('description') as string) || null

  if (!name?.trim()) return { error: 'テンプレート名を入力してください' }

  const { data, error } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .insert({ organization_id: actor.organizationId, name: name.trim(), description })
    .select('id')
    .single()

  if (error) return { error: error.message }

  redirect(`/org/${slug}/apps/patrol-navi/admin/checklists/${data.id}`)
}

// チェックリストテンプレート更新
export async function updateChecklistTemplateAction(
  templateId: string,
  slug: string,
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const name        = formData.get('name') as string
  const description = (formData.get('description') as string) || null
  const is_active   = formData.get('is_active') === 'true'

  if (!name?.trim()) return { error: 'テンプレート名を入力してください' }

  // テンプレートが actor の組織に属するか検証
  const { data: tpl } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('organization_id')
    .eq('id', templateId)
    .single()
  if (!tpl || tpl.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートを編集する権限がありません' }
  }

  const { error } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .update({ name: name.trim(), description, is_active })
    .eq('id', templateId)
    .eq('organization_id', actor.organizationId)

  if (error) return { error: error.message }

  await bumpChecklistVersion(templateId, actor.organizationId)
  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/checklists`)

  // 「閉じる」ボタンが押された時のみ一覧に戻る
  const closeAfter = formData.get('_close_after') === 'true'
  if (closeAfter) {
    redirect(`/org/${slug}/apps/patrol-navi/admin/checklists`)
  }
  return { success: true }
}

// テンプレート コピー (本体 + 全項目)
export async function copyChecklistTemplateAction(
  templateId: string,
  slug: string,
): Promise<{ error?: string; newId?: string }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: src } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  if (!src || src.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートを複製する権限がありません' }
  }

  // 末尾の sort_order を取得
  const { data: last } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('sort_order')
    .eq('organization_id', actor.organizationId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const newSortOrder = ((last?.sort_order as number | null) ?? 0) + 1

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .insert({
      organization_id: actor.organizationId,
      name:            `${src.name as string}（コピー）`,
      description:     src.description ?? null,
      is_active:       true,
      sort_order:      newSortOrder,
      version:         1,
    })
    .select('id')
    .single()
  if (insErr || !inserted) return { error: insErr?.message ?? 'コピー失敗' }
  const newId = inserted.id as string

  // 元のチェック項目を全件複製
  const { data: items } = await supabaseAdmin
    .from('patrol_items')
    .select('*')
    .eq('checklist_template_id', templateId)
    .eq('is_active', true)
    .order('sort_order')

  if (items && items.length > 0) {
    const rows = items.map((it) => ({
      organization_id:       actor.organizationId,
      checklist_template_id: newId,
      category1:             it.category1,
      category2:             it.category2,
      category3:             it.category3,
      item_text:             it.item_text,
      sort_order:            it.sort_order,
      is_important:          it.is_important,
      display_style:         it.display_style,
      weight:                it.weight,
      regulation_ref:        it.regulation_ref,
      input_type:            it.input_type,
      is_active:             true,
    }))
    const { error: itemErr } = await supabaseAdmin.from('patrol_items').insert(rows)
    if (itemErr) return { error: `項目の複製に失敗: ${itemErr.message}` }
  }

  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/checklists`)
  return { newId }
}

// テンプレート 削除 (soft delete)
export async function deleteChecklistTemplateAction(
  templateId: string,
  slug: string,
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: tpl } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('organization_id')
    .eq('id', templateId)
    .single()
  if (!tpl || tpl.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートを削除する権限がありません' }
  }

  const { error } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('organization_id', actor.organizationId)
  if (error) return { error: error.message }

  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/checklists`)
  return {}
}

// チェック項目 追加
export async function addPatrolItemAction(
  templateId: string,
  slug: string,
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // テンプレート所有組織を DB で検証（クライアントが渡す orgId は信用しない）
  const { data: tpl } = await supabaseAdmin
    .from('patrol_checklist_templates')
    .select('organization_id')
    .eq('id', templateId)
    .single()
  if (!tpl || tpl.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートを編集する権限がありません' }
  }

  const category1      = (formData.get('category1') as string)?.trim() ?? ''
  const category2      = (formData.get('category2') as string)?.trim() ?? ''
  const category3      = (formData.get('category3') as string)?.trim() ?? ''
  const item_text      = (formData.get('item_text') as string)?.trim() ?? ''
  const is_important   = formData.get('is_important') === 'on'

  // v2.4.0 新列
  const validStyles = ['normal','important_red','important_bold','critical'] as const
  const rawStyle = (formData.get('display_style') as string | null) ?? 'normal'
  const display_style = (validStyles.includes(rawStyle as never) ? rawStyle : 'normal') as typeof validStyles[number]
  const rawWeight = (formData.get('weight') as string | null) ?? '1.0'
  const weight = Number.isFinite(Number(rawWeight)) ? Number(rawWeight) : 1.0
  const regulation_ref = ((formData.get('regulation_ref') as string) || '').trim() || null

  if (!item_text) return { error: '項目内容を入力してください' }

  // 末尾のsort_orderを取得
  const { data: last } = await supabaseAdmin
    .from('patrol_items')
    .select('sort_order')
    .eq('checklist_template_id', templateId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = ((last?.sort_order as number | null) ?? 0) + 1

  const { error } = await supabaseAdmin
    .from('patrol_items')
    .insert({
      organization_id: actor.organizationId,
      checklist_template_id: templateId,
      category1,
      category2,
      category3,
      item_text,
      is_important,
      display_style,
      weight,
      regulation_ref,
      sort_order,
    })

  if (error) return { error: error.message }
  await bumpChecklistVersion(templateId, actor.organizationId)
  return { success: true }
}

// チェック項目 更新
export async function updatePatrolItemAction(
  itemId: string,
  slug: string,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // 項目が actor の組織に属するか検証
  const { data: row } = await supabaseAdmin
    .from('patrol_items')
    .select('checklist_template_id, organization_id')
    .eq('id', itemId)
    .single()
  if (!row || row.organization_id !== actor.organizationId) {
    return { error: 'この項目を編集する権限がありません' }
  }

  const category1    = (formData.get('category1') as string)?.trim() ?? ''
  const category2    = (formData.get('category2') as string)?.trim() ?? ''
  const category3    = (formData.get('category3') as string)?.trim() ?? ''
  const item_text    = (formData.get('item_text') as string)?.trim() ?? ''
  const is_important = formData.get('is_important') === 'on' || formData.get('is_important') === 'true'

  const validStyles = ['normal','important_red','important_bold','critical'] as const
  const rawStyle    = (formData.get('display_style') as string | null) ?? 'normal'
  const display_style = (validStyles.includes(rawStyle as never) ? rawStyle : 'normal') as typeof validStyles[number]
  const rawWeight     = (formData.get('weight') as string | null) ?? '1.0'
  const weight        = Number.isFinite(Number(rawWeight)) ? Number(rawWeight) : 1.0
  const regulation_ref = ((formData.get('regulation_ref') as string) || '').trim() || null

  if (!item_text) return { error: '項目内容を入力してください' }

  const { error } = await supabaseAdmin
    .from('patrol_items')
    .update({
      category1, category2, category3,
      item_text, is_important,
      display_style, weight, regulation_ref,
    })
    .eq('id', itemId)
    .eq('organization_id', actor.organizationId)

  if (error) return { error: error.message }
  await bumpChecklistVersion(row.checklist_template_id as string, actor.organizationId)
  return { success: true }
}

// チェック項目 順序入れ替え (隣接 swap)
//   2 つの項目の sort_order を atomic に入れ替える
export async function swapPatrolItemOrderAction(
  itemAId: string,
  itemBId: string,
  slug: string,
): Promise<{ error?: string }> {
  if (itemAId === itemBId) return {}
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: rows } = await supabaseAdmin
    .from('patrol_items')
    .select('id, sort_order, organization_id, checklist_template_id')
    .in('id', [itemAId, itemBId])
  if (!rows || rows.length !== 2) return { error: '対象項目が見つかりません' }
  const a = rows.find((r) => r.id === itemAId)
  const b = rows.find((r) => r.id === itemBId)
  if (!a || !b) return { error: '対象項目が見つかりません' }
  if (a.organization_id !== actor.organizationId || b.organization_id !== actor.organizationId) {
    return { error: 'この項目を編集する権限がありません' }
  }
  if (a.checklist_template_id !== b.checklist_template_id) {
    return { error: '異なるテンプレートの項目同士は入れ替えできません' }
  }

  // 中間値で 3 段階更新 (sort_order 重複事故を防止)
  const tmp = 99000 + (a.sort_order as number)
  const orderA = a.sort_order as number
  const orderB = b.sort_order as number

  let r
  r = await supabaseAdmin.from('patrol_items').update({ sort_order: tmp }).eq('id', itemAId)
  if (r.error) return { error: r.error.message }
  r = await supabaseAdmin.from('patrol_items').update({ sort_order: orderA }).eq('id', itemBId)
  if (r.error) return { error: r.error.message }
  r = await supabaseAdmin.from('patrol_items').update({ sort_order: orderB }).eq('id', itemAId)
  if (r.error) return { error: r.error.message }

  await bumpChecklistVersion(a.checklist_template_id as string, actor.organizationId)
  return {}
}

// チェック項目 削除
export async function deletePatrolItemAction(
  itemId: string,
  slug: string,
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // 項目が actor の組織に属するか検証してから削除（テンプレ ID も併せて取得）
  const { data: row } = await supabaseAdmin
    .from('patrol_items')
    .select('checklist_template_id, organization_id')
    .eq('id', itemId)
    .single()
  if (!row || row.organization_id !== actor.organizationId) {
    return { error: 'この項目を編集する権限がありません' }
  }

  const { error } = await supabaseAdmin
    .from('patrol_items')
    .update({ is_active: false })
    .eq('id', itemId)
    .eq('organization_id', actor.organizationId)

  if (error) return { error: error.message }
  await bumpChecklistVersion(row.checklist_template_id as string, actor.organizationId)
  return {}
}
