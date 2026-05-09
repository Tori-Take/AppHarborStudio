'use server'

import { getAdminSupabase } from '@/sdk'
const supabaseAdmin = getAdminSupabase()
import { revalidatePath } from 'next/cache'
import { redirect }       from 'next/navigation'
import { requirePatrolAdminAction as requireOrgAccess } from '../../_helpers/patrolRole'

// ワークフローテンプレート作成
export async function createWorkflowTemplateAction(
  slug: string,
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const name        = (formData.get('name') as string)?.trim()
  const description = (formData.get('description') as string) || null

  if (!name) return { error: 'テンプレート名を入力してください' }

  const { data, error } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .insert({ organization_id: actor.organizationId, name, description })
    .select('id')
    .single()

  if (error) return { error: error.message }

  redirect(`/org/${slug}/apps/patrol-navi/admin/workflows/${data.id}`)
}

// ワークフローテンプレート更新
export async function updateWorkflowTemplateAction(
  templateId: string,
  slug: string,
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const name        = (formData.get('name') as string)?.trim()
  const description = (formData.get('description') as string) || null
  const is_active   = formData.get('is_active') === 'true'

  if (!name) return { error: 'テンプレート名を入力してください' }

  // テンプレートが actor の組織に属するか検証
  const { data: tpl } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .select('organization_id')
    .eq('id', templateId)
    .single()
  if (!tpl || tpl.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートを編集する権限がありません' }
  }

  const { error } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .update({ name, description, is_active })
    .eq('id', templateId)
    .eq('organization_id', actor.organizationId)

  if (error) return { error: error.message }

  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/workflows`)

  // 「保存して閉じる」ボタンが押された時のみ一覧に戻る。
  // 「保存する」ボタンの場合はこのページに留まり success フラグを返す。
  const closeAfter = formData.get('_close_after') === 'true'
  if (closeAfter) {
    redirect(`/org/${slug}/apps/patrol-navi/admin/workflows`)
  }
  return { success: true }
}

// テンプレート コピー (本体 + 全ステップ)
export async function copyWorkflowTemplateAction(
  templateId: string,
  slug: string,
): Promise<{ error?: string; newId?: string }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: src } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  if (!src || src.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートを複製する権限がありません' }
  }

  const { data: last } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .select('sort_order')
    .eq('organization_id', actor.organizationId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const newSortOrder = ((last?.sort_order as number | null) ?? 0) + 1

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .insert({
      organization_id: actor.organizationId,
      name:            `${src.name as string}（コピー）`,
      description:     src.description ?? null,
      is_active:       true,
      sort_order:      newSortOrder,
    })
    .select('id')
    .single()
  if (insErr || !inserted) return { error: insErr?.message ?? 'コピー失敗' }
  const newId = inserted.id as string

  // 元のステップを全件複製
  const { data: steps } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .select('*')
    .eq('template_id', templateId)
    .order('step_order')

  if (steps && steps.length > 0) {
    const rows = steps.map((s) => ({
      template_id:         newId,
      step_order:          s.step_order,
      step_name:           s.step_name,
      step_type:           s.step_type ?? 'review',
      assignee_role_label: s.assignee_role_label ?? null,
      assignee_user_name:  s.assignee_user_name  ?? null,
    }))
    const { error: stepErr } = await supabaseAdmin.from('patrol_workflow_steps').insert(rows)
    if (stepErr) return { error: `ステップの複製に失敗: ${stepErr.message}` }
  }

  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/workflows`)
  return { newId }
}

// テンプレート 削除 (soft delete)
export async function deleteWorkflowTemplateAction(
  templateId: string,
  slug: string,
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: tpl } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .select('organization_id')
    .eq('id', templateId)
    .single()
  if (!tpl || tpl.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートを削除する権限がありません' }
  }

  const { error } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', templateId)
    .eq('organization_id', actor.organizationId)
  if (error) return { error: error.message }

  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/workflows`)
  return {}
}

// ステップ追加
export async function addWorkflowStepAction(
  templateId: string,
  slug: string,
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // テンプレート所有組織を検証
  const { data: tpl } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .select('organization_id')
    .eq('id', templateId)
    .single()
  if (!tpl || tpl.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートを編集する権限がありません' }
  }

  const step_name = (formData.get('step_name') as string)?.trim()
  console.log('[addWorkflowStepAction] templateId=', templateId, 'step_name=', step_name)
  if (!step_name) return { error: 'ステップ名を入力してください' }

  // v2.2.0: 4 種別
  const rawType = (formData.get('step_type') as string | null) ?? 'review'
  const validTypes = ['review','comment','notify','final_approve'] as const
  const step_type = (validTypes.includes(rawType as never) ? rawType : 'review') as typeof validTypes[number]

  // final_approve 制約チェック
  const { data: existingSteps } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .select('step_order, step_type')
    .eq('template_id', templateId)
  const hasFinalApprove = existingSteps?.some(s => s.step_type === 'final_approve')
  const finalApproveOrder = hasFinalApprove
    ? Math.max(...(existingSteps?.filter(s => s.step_type === 'final_approve').map(s => s.step_order as number) ?? []))
    : null

  // step_order:
  //   - parallel チェック ON → 現在の最大 step_order に並列追加（同番号）
  //   - OFF → 最大 + 1（新規 Stage、直列）
  const isParallel = formData.get('parallel') === 'true'
  const { data: last } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .select('step_order')
    .eq('template_id', templateId)
    .order('step_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastOrder = (last?.step_order ?? 0) as number
  const step_order = isParallel && lastOrder > 0 ? lastOrder : lastOrder + 1

  if (hasFinalApprove) {
    if (isParallel && step_type !== 'final_approve') {
      return { error: '最終承認ステージには最終承認ステップのみ追加できます' }
    }
    if (!isParallel) {
      return { error: '最終承認ステップの後にステップを追加できません。並列で最終承認者を追加するか、既存の最終承認を削除してください' }
    }
  }
  if (step_type === 'final_approve' && !isParallel && finalApproveOrder !== null) {
    return { error: '最終承認は既に存在します。並列で追加するか、既存のものを削除してください' }
  }

  // 重複防止: 同テンプレ・同 step_order・同 step_name が既にあれば skip
  // （フォーム二重 submit / 連打対策）
  const { data: dup } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .select('id')
    .eq('template_id', templateId)
    .eq('step_order', step_order)
    .eq('step_name', step_name)
    .maybeSingle()
  if (dup) {
    return { success: true }  // 同じものが既にあるので no-op
  }

  // 役割（必須）と固定担当者（任意）
  const assignee_role_label = ((formData.get('assignee_role_label') as string) || '').trim()
  const assignee_user_name  = ((formData.get('assignee_user_name')  as string) || '').trim() || null

  if (!assignee_role_label) {
    return { error: '役割を選択してください' }
  }

  const { error } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .insert({
      template_id: templateId,
      step_order,
      step_name,
      step_type,
      assignee_role_label,
      assignee_user_name,
    })

  if (error) {
    console.log('[addWorkflowStepAction] insert error:', error.message)
    return { error: error.message }
  }
  console.log('[addWorkflowStepAction] inserted step_order=', step_order)
  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/workflows/${templateId}`)
  return { success: true }
}

// ステップ更新 (内容のみ。step_order の変更はしない)
export async function updateWorkflowStepAction(
  stepId: string,
  slug: string,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // ステップの属するテンプレートが actor の組織か検証
  const { data: step } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .select('template_id, patrol_workflow_templates!template_id(organization_id)')
    .eq('id', stepId)
    .single()
  const tpl = (step?.patrol_workflow_templates) as { organization_id: string } | { organization_id: string }[] | null
  const tplOrg = Array.isArray(tpl) ? tpl[0]?.organization_id : tpl?.organization_id
  if (!tplOrg || tplOrg !== actor.organizationId) {
    return { error: 'このステップを編集する権限がありません' }
  }

  const step_name = (formData.get('step_name') as string)?.trim()
  if (!step_name) return { error: 'ステップ名を入力してください' }

  const rawType    = (formData.get('step_type') as string | null) ?? 'review'
  const validTypes = ['review','comment','notify','final_approve'] as const
  const step_type  = (validTypes.includes(rawType as never) ? rawType : 'review') as typeof validTypes[number]

  const assignee_role_label = ((formData.get('assignee_role_label') as string) || '').trim()
  const assignee_user_name  = ((formData.get('assignee_user_name')  as string) || '').trim() || null

  if (!assignee_role_label) {
    return { error: '役割を選択してください' }
  }

  // final_approve 制約: 変更先が final_approve なら最後のステージか確認
  if (step_type === 'final_approve') {
    const templateId = step?.template_id as string
    const { data: allSteps } = await supabaseAdmin
      .from('patrol_workflow_steps')
      .select('id, step_order, step_type')
      .eq('template_id', templateId)
    const thisStep = allSteps?.find(s => s.id === stepId)
    const maxOrder = Math.max(...(allSteps?.map(s => s.step_order as number) ?? [0]))
    if (thisStep && (thisStep.step_order as number) < maxOrder) {
      return { error: '最終承認は最後のステージにのみ設定できます' }
    }
  }

  const { error } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .update({ step_name, step_type, assignee_role_label, assignee_user_name })
    .eq('id', stepId)

  if (error) return { error: error.message }

  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/workflows`)
  return { success: true }
}

// ステージ順序入れ替え (並列ステップごとまるごと swap)
//   - fromOrder と toOrder を持つすべてのステップの step_order を入れ替える
//   - 並列ステップ (同 step_order を共有) も自動的に揃って動く
//   - 隣接でなくても動く (UI 側は隣接 swap のみ提供する想定)
export async function swapStageOrderAction(
  templateId: string,
  slug: string,
  fromOrder: number,
  toOrder: number,
): Promise<{ error?: string }> {
  if (fromOrder === toOrder) return {}
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const { data: tpl } = await supabaseAdmin
    .from('patrol_workflow_templates')
    .select('organization_id')
    .eq('id', templateId)
    .single()
  if (!tpl || tpl.organization_id !== actor.organizationId) {
    return { error: 'このテンプレートを編集する権限がありません' }
  }

  // final_approve 制約: swap で final_approve が最後でなくなる場合をブロック
  const { data: allSteps } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .select('step_order, step_type')
    .eq('template_id', templateId)
  const maxOrder = Math.max(...(allSteps?.map(s => s.step_order as number) ?? [0]))
  const finalInFrom = allSteps?.some(s => s.step_order === fromOrder && s.step_type === 'final_approve')
  const finalInTo   = allSteps?.some(s => s.step_order === toOrder   && s.step_type === 'final_approve')
  if (finalInFrom && fromOrder === maxOrder && toOrder < maxOrder) {
    return { error: '最終承認ステージは最後から移動できません' }
  }
  if (finalInTo && toOrder === maxOrder && fromOrder < maxOrder) {
    return { error: '最終承認ステージは最後から移動できません' }
  }

  // step_order を一時的に -1 オフセットに退避してから本番値に戻すことで
  // 値の重複・上書きを避ける (PostgreSQL の UPDATE は行単位の処理順が
  // 不定なので、CASE 一発でも安全だが念のため 2 段階で行う)。
  // 中間値: 9000 + fromOrder (現実的に存在しない値域)
  const tmp = 9000 + fromOrder
  // 1. fromOrder → tmp
  const r1 = await supabaseAdmin
    .from('patrol_workflow_steps')
    .update({ step_order: tmp })
    .eq('template_id', templateId)
    .eq('step_order', fromOrder)
  if (r1.error) return { error: r1.error.message }

  // 2. toOrder → fromOrder
  const r2 = await supabaseAdmin
    .from('patrol_workflow_steps')
    .update({ step_order: fromOrder })
    .eq('template_id', templateId)
    .eq('step_order', toOrder)
  if (r2.error) return { error: r2.error.message }

  // 3. tmp → toOrder
  const r3 = await supabaseAdmin
    .from('patrol_workflow_steps')
    .update({ step_order: toOrder })
    .eq('template_id', templateId)
    .eq('step_order', tmp)
  if (r3.error) return { error: r3.error.message }

  revalidatePath(`/org/${slug}/apps/patrol-navi/admin/workflows/${templateId}`)
  return {}
}

// ステップ削除
export async function deleteWorkflowStepAction(
  stepId: string,
  slug: string,
): Promise<{ error?: string }> {
  const guard = await requireOrgAccess(slug)
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // ステップの属するテンプレートが actor の組織に属するか検証
  const { data: step } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .select('template_id, patrol_workflow_templates!template_id(organization_id)')
    .eq('id', stepId)
    .single()

  const tpl = (step?.patrol_workflow_templates) as { organization_id: string } | { organization_id: string }[] | null
  const tplOrg = Array.isArray(tpl) ? tpl[0]?.organization_id : tpl?.organization_id
  if (!tplOrg || tplOrg !== actor.organizationId) {
    return { error: 'このステップを削除する権限がありません' }
  }

  const { error } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .delete()
    .eq('id', stepId)

  if (error) return { error: error.message }
  return {}
}
