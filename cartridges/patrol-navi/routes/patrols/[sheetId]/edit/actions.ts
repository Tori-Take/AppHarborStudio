'use server'

import { getAdminSupabase, getAppRole } from '@/sdk'
const supabaseAdmin = getAdminSupabase()
import { revalidatePath } from 'next/cache'
import { redirect }      from 'next/navigation'
import { requireActor as requireOrgAccess } from '@/sdk'
import type { PatrolItemResult } from '../../../_types'
import { isPatrolAdmin } from '../../../_helpers/patrolRole'

export type SaveResultsState = {
  error?:   string
  success?: boolean
}

// ─── 全アイテムの結果を保存 ─────────────────────────────────────

export async function savePatrolResultsAction(
  slug: string,
  sheetId: string,
  _prev: SaveResultsState,
  formData: FormData
): Promise<SaveResultsState> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // シートの存在確認＋組織所属検証
  const { data: sheet } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('id, status, patroller_id, organization_id')
    .eq('id', sheetId)
    .single()

  if (!sheet) return { error: 'シートが見つかりません' }
  if (sheet.organization_id !== actor.organizationId) {
    return { error: 'このシートにアクセスする権限がありません' }
  }
  // 編集可能なのは draft/remanded のシートのみ（in_progress / completed
  // ではワークフロー進行中のデータ改ざんを避けるため admin でも編集不可）
  if (sheet.status !== 'draft' && sheet.status !== 'remanded') {
    return { error: 'このシートは編集できません（draft/remanded のみ編集可）' }
  }
  const role = await getAppRole({
    organizationId: actor.organizationId,
    userId:         actor.id,
    departmentId:   actor.departmentId,
    appId:          'patrol-navi',
  })
  const isAdmin = isPatrolAdmin(role)
  if (!isAdmin && sheet.patroller_id !== actor.id) {
    return { error: '権限がありません' }
  }

  // フォームから結果を取得して更新
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('result_')) {
      const itemId = key.replace('result_', '')
      const result = value as PatrolItemResult
      const comment = (formData.get(`comment_${itemId}`) as string) || null

      await supabaseAdmin
        .from('patrol_sheet_items')
        .update({ result, comment })
        .eq('id', itemId)
        .eq('sheet_id', sheetId)
    }
  }

  // パトロール全体コメント（feedback）+ ステータスの一時保存
  // remanded → draft に戻す（差戻しを再編集中の状態にする）
  // 他のステータスは保持（admin が in_progress を編集する場合のワークフロー維持）
  const feedback = (formData.get('feedback') as string | null)
  const updates: Record<string, unknown> = {}
  if (feedback !== null) updates.feedback = feedback.trim() || null
  if (sheet.status === 'remanded') updates.status = 'draft'
  if (Object.keys(updates).length > 0) {
    await supabaseAdmin
      .from('patrol_check_sheets')
      .update(updates)
      .eq('id', sheetId)
  }

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}/edit`)
  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols`)
  return { success: true }
}

// ─── 提出（draft → in_progress） ────────────────────────────────

export async function submitPatrolAction(
  slug: string,
  sheetId: string
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: sheet } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('id, status, patroller_id, organization_id')
    .eq('id', sheetId)
    .single()

  if (!sheet) return { error: 'シートが見つかりません' }
  if (sheet.organization_id !== actor.organizationId) {
    return { error: 'このシートにアクセスする権限がありません' }
  }
  // 提出（ワークフロー起動）は draft/remanded のシートのみ。
  // admin が in_progress 等のシートを編集する時は提出不要（保存のみ）。
  if (sheet.patroller_id !== actor.id) {
    // admin が他者シートを「提出」する操作は想定外（現状は禁止）
    const role = await getAppRole({
      organizationId: actor.organizationId,
      userId:         actor.id,
      departmentId:   actor.departmentId,
      appId:          'patrol-navi',
    })
    if (!isPatrolAdmin(role)) return { error: '権限がありません' }
  }
  if (sheet.status !== 'draft' && sheet.status !== 'remanded') {
    return { error: 'このシートは提出できません' }
  }

  // ステータスを in_progress に更新
  const { error: updateError } = await supabaseAdmin
    .from('patrol_check_sheets')
    .update({ status: 'in_progress', current_step: 1 })
    .eq('id', sheetId)

  if (updateError) return { error: updateError.message }

  // ステップ1を pending に設定（既にpendingのはずだが念のため）
  await supabaseAdmin
    .from('patrol_sheet_steps')
    .update({ status: 'pending' })
    .eq('sheet_id', sheetId)
    .eq('step_order', 1)

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols`)
  redirect(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
}
