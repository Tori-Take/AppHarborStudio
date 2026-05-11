'use server'

import { getAdminSupabase } from '@/sdk'
const supabaseAdmin = getAdminSupabase()
import { revalidatePath } from 'next/cache'
import { redirect }       from 'next/navigation'
import { requireActor as requireOrgAccess } from '@/sdk'

// ─── ステップ承認 ────────────────────────────────────────────────

export async function approveStepAction(
  slug: string,
  sheetId: string,
  stepId: string,
  comment: string
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // ステップ情報＋シート所属組織を取得
  const { data: step } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('*, patrol_check_sheets!inner(organization_id)')
    .eq('id', stepId)
    .eq('sheet_id', sheetId)
    .single()

  if (!step) return { error: 'ステップが見つかりません' }
  const sheetOrg = (step as { patrol_check_sheets: { organization_id: string } | { organization_id: string }[] }).patrol_check_sheets
  const sheetOrgId = Array.isArray(sheetOrg) ? sheetOrg[0]?.organization_id : sheetOrg?.organization_id
  if (sheetOrgId !== actor.organizationId) {
    return { error: 'このシートにアクセスする権限がありません' }
  }
  if (step.assignee_id && step.assignee_id !== actor.id) {
    return { error: '承認権限がありません' }
  }
  if (step.status !== 'pending') {
    return { error: 'このステップは処理済みです' }
  }

  // comment ステップはコメント必須
  if (step.step_type === 'comment' && !comment?.trim()) {
    return { error: 'コメントを入力してください' }
  }

  // ステップを承認
  const { error: stepError } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .update({
      status:   'approved',
      comment:  comment || null,
      acted_at: new Date().toISOString(),
    })
    .eq('id', stepId)

  if (stepError) return { error: stepError.message }

  // v2.7.0: 並列対応 + final_approve + notify を考慮した進行ロジック
  await advanceWorkflow(sheetId, step.step_order as number)

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols`)
  redirect(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
}

// ─── v2.7.0: ワークフロー進行ロジック ──────────────────────
// 仕様書 §4.3 に従って:
//   1. 現 stage の notify ステップを auto-approved にする
//   2. 必須 step (review/comment/final_approve) が全て approved なら次の stage へ
//   3. final_approve が 1 つでも approved ならシート全体完了
//   4. 次 stage が notify だけなら自動進行（再帰）
type StepType = 'review' | 'comment' | 'notify' | 'final_approve'
const REQUIRED_TYPES: StepType[] = ['review', 'comment', 'final_approve']

async function advanceWorkflow(sheetId: string, stageOrder: number): Promise<void> {
  // 現 stage の全ステップ取得
  const { data: stageStepsRaw } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('id, step_type, status')
    .eq('sheet_id', sheetId)
    .eq('step_order', stageOrder)
  type SS = { id: string; step_type: string | null; status: string }
  const stageSteps = (stageStepsRaw as SS[] | null) ?? []

  // notify ステップを auto-approved に（並列で待たないため）
  const pendingNotify = stageSteps.filter((s) => s.step_type === 'notify' && s.status === 'pending')
  if (pendingNotify.length > 0) {
    await supabaseAdmin
      .from('patrol_sheet_steps')
      .update({ status: 'approved', acted_at: new Date().toISOString() })
      .in('id', pendingNotify.map((s) => s.id))
  }

  // 状態を最新化
  const refreshed = stageSteps.map((s) =>
    pendingNotify.some((n) => n.id === s.id) ? { ...s, status: 'approved' } : s
  )

  // final_approve が 1 つでも approved → シート完了
  const finalApproved = refreshed.some(
    (s) => s.step_type === 'final_approve' && s.status === 'approved',
  )
  if (finalApproved) {
    await supabaseAdmin
      .from('patrol_check_sheets')
      .update({ status: 'completed', current_step: stageOrder })
      .eq('id', sheetId)
    return
  }

  // 必須 step がまだ pending → 待ち
  const stillPending = refreshed.some(
    (s) => s.status === 'pending' && REQUIRED_TYPES.includes(s.step_type as StepType),
  )
  if (stillPending) return

  // 次の stage へ
  const nextStage = stageOrder + 1
  const { data: nextStepsRaw } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('id, step_type, status')
    .eq('sheet_id', sheetId)
    .eq('step_order', nextStage)
  const nextSteps = (nextStepsRaw as SS[] | null) ?? []

  if (nextSteps.length === 0) {
    // 後続 stage なし → 全工程終了
    await supabaseAdmin
      .from('patrol_check_sheets')
      .update({ status: 'completed', current_step: stageOrder })
      .eq('id', sheetId)
    return
  }

  // current_step を進める
  await supabaseAdmin
    .from('patrol_check_sheets')
    .update({ current_step: nextStage })
    .eq('id', sheetId)

  // 次 stage が notify だけ ⇒ 連鎖進行（再帰）
  const hasRequired = nextSteps.some((s) =>
    REQUIRED_TYPES.includes(s.step_type as StepType),
  )
  if (!hasRequired) {
    await advanceWorkflow(sheetId, nextStage)
  }
}

// ─── ステップ引き戻し（承認済みステップを pending に戻す） ──────

export async function withdrawStepAction(
  slug: string,
  sheetId: string,
  stepId: string,
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: step } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('*, patrol_check_sheets!inner(organization_id, status)')
    .eq('id', stepId)
    .eq('sheet_id', sheetId)
    .single()

  if (!step) return { error: 'ステップが見つかりません' }
  const sheetOrg = (step as { patrol_check_sheets: { organization_id: string; status: string } | { organization_id: string; status: string }[] }).patrol_check_sheets
  const sheetInfo = Array.isArray(sheetOrg) ? sheetOrg[0] : sheetOrg
  if (sheetInfo?.organization_id !== actor.organizationId) {
    return { error: 'このシートにアクセスする権限がありません' }
  }
  if (step.assignee_id && step.assignee_id !== actor.id) {
    return { error: '操作権限がありません' }
  }
  if (step.status !== 'approved') {
    return { error: 'このステップは引き戻しできません' }
  }
  if (sheetInfo?.status !== 'in_progress') {
    return { error: 'ワークフロー進行中でないため引き戻しできません' }
  }

  // 後続ステップが操作済みなら引き戻し不可
  const { data: laterSteps } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('id, status')
    .eq('sheet_id', sheetId)
    .gt('step_order', step.step_order)
    .neq('status', 'pending')
    .limit(1)
  if (laterSteps && laterSteps.length > 0) {
    return { error: '後続のステップが操作済みのため引き戻しできません' }
  }

  // ステップを pending に戻す
  const { error: stepError } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .update({ status: 'pending', acted_at: null })
    .eq('id', stepId)
  if (stepError) return { error: stepError.message }

  // current_step をこのステップの step_order に戻す
  await supabaseAdmin
    .from('patrol_check_sheets')
    .update({ current_step: step.step_order })
    .eq('id', sheetId)

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols`)
  redirect(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
}

// ─── ステップコメント追加（完了後でも可） ─────────────────────────

export async function addStepCommentAction(
  slug: string,
  sheetId: string,
  stepId: string,
  comment: string,
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: step } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('*, patrol_check_sheets!inner(organization_id)')
    .eq('id', stepId)
    .eq('sheet_id', sheetId)
    .single()

  if (!step) return { error: 'ステップが見つかりません' }
  const sheetOrg = (step as { patrol_check_sheets: { organization_id: string } | { organization_id: string }[] }).patrol_check_sheets
  const sheetOrgId = Array.isArray(sheetOrg) ? sheetOrg[0]?.organization_id : sheetOrg?.organization_id
  if (sheetOrgId !== actor.organizationId) {
    return { error: 'このシートにアクセスする権限がありません' }
  }
  if (step.assignee_id && step.assignee_id !== actor.id) {
    return { error: '操作権限がありません' }
  }

  await supabaseAdmin
    .from('patrol_sheet_steps')
    .update({
      comment: comment.trim() || null,
      acted_at: new Date().toISOString(),
    })
    .eq('id', stepId)

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
  return {}
}

// ─── 差戻し ─────────────────────────────────────────────────────

export async function remandSheetAction(
  slug: string,
  sheetId: string,
  stepId: string,
  comment: string
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: step } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('*, patrol_check_sheets!inner(organization_id)')
    .eq('id', stepId)
    .eq('sheet_id', sheetId)
    .single()

  if (!step) return { error: 'ステップが見つかりません' }
  const sheetOrg = (step as { patrol_check_sheets: { organization_id: string } | { organization_id: string }[] }).patrol_check_sheets
  const sheetOrgId = Array.isArray(sheetOrg) ? sheetOrg[0]?.organization_id : sheetOrg?.organization_id
  if (sheetOrgId !== actor.organizationId) {
    return { error: 'このシートにアクセスする権限がありません' }
  }
  if (step.assignee_id && step.assignee_id !== actor.id) {
    return { error: '操作権限がありません' }
  }
  if (step.status !== 'pending') {
    return { error: 'このステップは処理済みです' }
  }

  // ステップを差戻し
  await supabaseAdmin
    .from('patrol_sheet_steps')
    .update({
      status:   'remanded',
      comment:  comment || null,
      acted_at: new Date().toISOString(),
    })
    .eq('id', stepId)

  // シートを remanded に
  const { error: sheetError } = await supabaseAdmin
    .from('patrol_check_sheets')
    .update({ status: 'remanded' })
    .eq('id', sheetId)

  if (sheetError) return { error: sheetError.message }

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols`)
  redirect(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
}

// ─── 下書き削除（自分の draft のみ soft delete） ─────────────────
export async function deletePatrolSheetAction(
  slug: string,
  sheetId: string,
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
  if (sheet.patroller_id !== actor.id) {
    return { error: '自分のパトロールのみ削除できます' }
  }
  if (sheet.status !== 'draft') {
    return { error: '下書き中のパトロールのみ削除できます' }
  }

  const { error: updErr } = await supabaseAdmin
    .from('patrol_check_sheets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sheetId)
  if (updErr) return { error: updErr.message }

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols`)
  redirect(`/org/${slug}/apps/patrol-navi/patrols`)
}

// ─── 引き戻し（提出済みを下書きに戻す） ────────────────────────────
// 提出者本人が、まだ誰も承認・コメント等の操作をしていないうちに限り
// in_progress → draft に戻して再編集を可能にする。
export async function withdrawSubmissionAction(
  slug: string,
  sheetId: string,
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
  if (sheet.patroller_id !== actor.id) {
    return { error: '提出者本人のみ引き戻し可能です' }
  }
  if (sheet.status !== 'in_progress') {
    return { error: 'このシートは引き戻しできません' }
  }

  // 既に承認・操作されたステップがあれば引き戻し不可
  const { data: anyActed } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('id')
    .eq('sheet_id', sheetId)
    .neq('status', 'pending')
    .limit(1)
  if (anyActed && anyActed.length > 0) {
    return { error: '既に承認・コメント等の操作があるため引き戻しできません' }
  }

  // status を draft に戻し、current_step を 0 に
  const { error: updErr } = await supabaseAdmin
    .from('patrol_check_sheets')
    .update({ status: 'draft', current_step: 0 })
    .eq('id', sheetId)
  if (updErr) return { error: updErr.message }

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols`)
  redirect(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}/edit`)
}
