'use server'

import { getAdminSupabase } from '@/sdk'
const supabaseAdmin = getAdminSupabase()
import { redirect }      from 'next/navigation'
import { requireActor as requireOrgAccess } from '@/sdk'

export type CreatePatrolSheetState = {
  error?: string
  sheetId?: string
}

export async function createPatrolSheetAction(
  slug: string,
  _prev: CreatePatrolSheetState,
  formData: FormData
): Promise<CreatePatrolSheetState> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const checklistTemplateId = formData.get('checklistTemplateId') as string
  const workflowTemplateId  = formData.get('workflowTemplateId')  as string
  const patrolDate          = formData.get('patrolDate')           as string
  const siteName            = formData.get('siteName')             as string
  const crewName            = (formData.get('crewName') as string) || null
  const patrollerId         = (formData.get('patrollerId') as string) || actor.id

  if (!checklistTemplateId || !workflowTemplateId || !patrolDate || !siteName) {
    return { error: '必須項目を入力してください' }
  }

  // テンプレートが actor の組織に属するか検証
  const [{ data: cTpl }, { data: wTpl }] = await Promise.all([
    supabaseAdmin.from('patrol_checklist_templates').select('organization_id, version').eq('id', checklistTemplateId).single(),
    supabaseAdmin.from('patrol_workflow_templates') .select('organization_id').eq('id', workflowTemplateId) .single(),
  ])
  if (!cTpl || cTpl.organization_id !== actor.organizationId
   || !wTpl || wTpl.organization_id !== actor.organizationId) {
    return { error: '指定されたテンプレートを使用する権限がありません' }
  }
  const checklistVersion = (cTpl.version as number | null) ?? 1

  // ─── パトロールシートを作成 ─────────────────────────────────
  const { data: sheet, error: sheetError } = await supabaseAdmin
    .from('patrol_check_sheets')
    .insert({
      organization_id:       actor.organizationId,
      checklist_template_id: checklistTemplateId,
      template_version:      checklistVersion,
      workflow_template_id:  workflowTemplateId,
      patrol_date:           patrolDate,
      site_name:             siteName,
      crew_name:             crewName,
      patroller_id:          patrollerId,
      status:                'draft',
      current_step:          0,
    })
    .select('id')
    .single()

  if (sheetError || !sheet) {
    return { error: sheetError?.message ?? 'シートの作成に失敗しました' }
  }

  const sheetId = sheet.id

  // ─── チェックリスト項目を一括コピー ────────────────────────
  const { data: items, error: itemsError } = await supabaseAdmin
    .from('patrol_items')
    .select('*')
    .eq('checklist_template_id', checklistTemplateId)
    .eq('is_active', true)
    .order('sort_order')

  if (itemsError) {
    return { error: itemsError.message }
  }

  if (items && items.length > 0) {
    const sheetItems = items.map(item => ({
      sheet_id:        sheetId,
      item_id:         item.id,
      category1:       item.category1,
      category2:       item.category2,
      category3:       (item as { category3?: string }).category3 ?? '',         // v2.4.0
      item_text:       item.item_text,
      is_important:    item.is_important,
      display_style:   (item as { display_style?: string }).display_style ?? 'normal',   // v2.4.0
      weight:          (item as { weight?: number }).weight ?? 1.0,              // v2.4.0
      regulation_ref:  (item as { regulation_ref?: string | null }).regulation_ref ?? null, // v2.4.0
      input_type:      (item as { input_type?: string }).input_type ?? 'result_only',     // v2.4.0
      sort_order:      item.sort_order,
      result:          null,
      photo_urls:      [],
      comment:         null,
    }))

    const { error: insertItemsError } = await supabaseAdmin
      .from('patrol_sheet_items')
      .insert(sheetItems)

    if (insertItemsError) {
      return { error: insertItemsError.message }
    }
  }

  // ─── ワークフローステップを一括コピー ──────────────────────
  const { data: wfSteps, error: stepsError } = await supabaseAdmin
    .from('patrol_workflow_steps')
    .select('*')
    .eq('template_id', workflowTemplateId)
    .order('step_order')

  if (stepsError) {
    return { error: stepsError.message }
  }

  if (wfSteps && wfSteps.length > 0) {
    // v2.2.0: 既定担当者名 (assignee_user_name) を display_name 一致で user_id に解決
    // 解決失敗 (退職等) の場合は resolved_assignee_id = NULL（snapshot のテキストは残る）
    // 特殊 sentinel '__patroller_self__' はシート提出者本人（actor.id）に解決
    const PATROLLER_SELF = '__patroller_self__'
    const allUserNames = Array.from(new Set(
      wfSteps
        .map((s) => (s as { assignee_user_name?: string | null }).assignee_user_name)
        .filter((n): n is string => !!n && n.length > 0 && n !== PATROLLER_SELF),
    ))
    const nameToId = new Map<string, string>()
    if (allUserNames.length > 0) {
      const { data: profileRows } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name')
        .eq('organization_id', actor.organizationId)
        .in('display_name', allUserNames)
      for (const p of (profileRows as Array<{ id: string; display_name: string }> | null) ?? []) {
        if (!nameToId.has(p.display_name)) nameToId.set(p.display_name, p.id)
      }
    }

    // 役割ラベル → 既定担当者の user_id[] のマップを構築
    // パトロール者ロール（is_system かつ key='patroller'）は __patroller_self__ と同等扱い
    const allRoleLabels = Array.from(new Set(
      wfSteps
        .map((s) => (s as { assignee_role_label?: string | null }).assignee_role_label)
        .filter((n): n is string => !!n && n.length > 0),
    ))
    const roleLabelToUserIds = new Map<string, string[]>()
    const patrollerRoleLabels = new Set<string>()
    if (allRoleLabels.length > 0) {
      const { data: roleRows } = await supabaseAdmin
        .from('patrol_workflow_roles')
        .select('id, key, label, is_system')
        .eq('organization_id', actor.organizationId)
        .is('deleted_at', null)
        .in('label', allRoleLabels)
      const roleIdToLabel = new Map<string, string>()
      for (const r of (roleRows as Array<{ id: string; key: string; label: string; is_system: boolean }> | null) ?? []) {
        roleIdToLabel.set(r.id, r.label)
        if (r.is_system && r.key === 'patroller') patrollerRoleLabels.add(r.label)
      }
      const roleIds = Array.from(roleIdToLabel.keys())
      if (roleIds.length > 0) {
        const { data: bindings } = await supabaseAdmin
          .from('patrol_workflow_role_bindings')
          .select('role_id, user_id')
          .in('role_id', roleIds)
        for (const b of (bindings as Array<{ role_id: string; user_id: string }> | null) ?? []) {
          const label = roleIdToLabel.get(b.role_id)
          if (!label) continue
          const arr = roleLabelToUserIds.get(label) ?? []
          arr.push(b.user_id)
          roleLabelToUserIds.set(label, arr)
        }
      }
    }

    const sheetSteps = wfSteps.map(step => {
      const wf = step as {
        step_order: number
        step_name: string
        step_type: string | null
        assignee_role_label: string | null
        assignee_user_name: string | null
      }
      // フォーム override（同 step_order の最初のステップだけ override 可、簡易版）
      const formOverride = (formData.get(`assignee_${wf.step_order}`) as string) || null

      // 解決順:
      //   1. form override（パトロール者がシート提出時に明示指定）
      //   2. assignee_user_name が '__patroller_self__' → 提出者本人 (patrollerId)
      //   3. テンプレ固定の user_name (display_name 一致)
      //   4. 役割「パトロール者」(is_system) → 提出者本人
      //   5. 役割の既定担当者 (role_bindings の先頭)
      let resolvedId: string | null = null
      let snapshotName = wf.assignee_user_name  // 表示用（sentinel もそのまま保存）
      if (formOverride) {
        resolvedId = formOverride
      } else if (wf.assignee_user_name === PATROLLER_SELF) {
        resolvedId = patrollerId
        snapshotName = 'パトロール実施者本人'  // 表示は分かりやすく書き換え
      } else if (wf.assignee_user_name) {
        resolvedId = nameToId.get(wf.assignee_user_name) ?? null
      } else if (wf.assignee_role_label && patrollerRoleLabels.has(wf.assignee_role_label)) {
        resolvedId = patrollerId
        snapshotName = 'パトロール実施者本人'
      } else if (wf.assignee_role_label) {
        const ids = roleLabelToUserIds.get(wf.assignee_role_label) ?? []
        resolvedId = ids[0] ?? null
      }

      return {
        sheet_id:                       sheetId,
        step_order:                     wf.step_order,
        step_name:                      wf.step_name,
        step_type:                      (wf.step_type as 'review'|'comment'|'notify'|'final_approve' | null) ?? 'review',
        assignee_id:                    resolvedId,
        assignee_role_label_snapshot:   wf.assignee_role_label,
        assignee_user_name_snapshot:    snapshotName,
        resolved_assignee_id:           resolvedId,
        status:                         'pending' as const,
        comment:                        null,
        acted_at:                       null,
      }
    })

    const { error: insertStepsError } = await supabaseAdmin
      .from('patrol_sheet_steps')
      .insert(sheetSteps)

    if (insertStepsError) {
      return { error: insertStepsError.message }
    }
  }

  redirect(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}/edit`)
}
