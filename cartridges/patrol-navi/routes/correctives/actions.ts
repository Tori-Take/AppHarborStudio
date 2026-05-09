'use server'

import { getAdminSupabase } from '@/sdk'
const supabaseAdmin = getAdminSupabase()
import { revalidatePath } from 'next/cache'
import { requireActor as requireOrgAccess } from '@/sdk'
import type { CorrectiveActionStatus } from '../_types'

export type ActionResult = { error?: string }

// 新規作成: NG 検査項目に是正担当を割当
export async function createCorrectiveAction(
  slug:        string,
  sheetItemId: string,
  assigneeId:  string,
  dueDate:     string | null,
  comment:     string | null,
): Promise<ActionResult> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // sheet_item の所属組織を確認
  const { data: row } = await supabaseAdmin
    .from('patrol_sheet_items')
    .select('id, sheet_id, photo_urls, patrol_check_sheets!inner(organization_id)')
    .eq('id', sheetItemId)
    .single()
  if (!row) return { error: '対象項目が見つかりません' }
  const sheet = (row as { patrol_check_sheets: { organization_id: string } | { organization_id: string }[] }).patrol_check_sheets
  const orgId = Array.isArray(sheet) ? sheet[0]?.organization_id : sheet?.organization_id
  if (orgId !== actor.organizationId) return { error: 'アクセス権限がありません' }

  // 担当者が同組織か確認
  const { data: ap } = await supabaseAdmin
    .from('profiles')
    .select('id, organization_id, status')
    .eq('id', assigneeId)
    .single()
  if (!ap || ap.organization_id !== actor.organizationId || ap.status !== 'active') {
    return { error: '担当者の指定が不正です' }
  }

  const { error } = await supabaseAdmin
    .from('patrol_corrective_actions')
    .insert({
      organization_id:   actor.organizationId,
      sheet_item_id:     sheetItemId,
      assignee_id:       assigneeId,
      due_date:          dueDate,
      status:            'open',
      comment,
      before_photo_urls: (row.photo_urls as string[] | null) ?? [],
      created_by:        actor.id,
    })
  if (error) return { error: '登録に失敗しました' }

  const sheetIdValue = row.sheet_id as string
  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetIdValue}`)
  revalidatePath(`/org/${slug}/apps/patrol-navi/correctives`)
  return {}
}

// ステータス更新（着手・完了・取消）
export async function updateCorrectiveStatus(
  slug:     string,
  actionId: string,
  next:     CorrectiveActionStatus,
  note?:    string,
): Promise<ActionResult> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: ca } = await supabaseAdmin
    .from('patrol_corrective_actions')
    .select('id, organization_id, assignee_id, sheet_item_id')
    .eq('id', actionId)
    .single()
  if (!ca) return { error: '是正記録が見つかりません' }
  if (ca.organization_id !== actor.organizationId) return { error: 'アクセス権限がありません' }
  // 担当者または管理者しか更新不可（dept-admin / org-admin は OK）
  const isAssignee = ca.assignee_id === actor.id
  const isAdminish = actor.orgRole === 'org-admin' || actor.orgRole === 'dept-admin'
  if (!isAssignee && !isAdminish) return { error: '更新権限がありません' }

  const patch: Record<string, unknown> = { status: next }
  if (next === 'completed') {
    patch.completed_at    = new Date().toISOString()
    patch.completion_note = note ?? null
  } else if (next === 'cancelled') {
    patch.completion_note = note ?? null
  }

  const { error } = await supabaseAdmin
    .from('patrol_corrective_actions')
    .update(patch)
    .eq('id', actionId)
  if (error) return { error: '更新に失敗しました' }

  // sheet_id を取得して revalidate
  const { data: itemRow } = await supabaseAdmin
    .from('patrol_sheet_items')
    .select('sheet_id')
    .eq('id', ca.sheet_item_id as string)
    .single()
  if (itemRow) {
    revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${itemRow.sheet_id as string}`)
  }
  revalidatePath(`/org/${slug}/apps/patrol-navi/correctives`)
  return {}
}
