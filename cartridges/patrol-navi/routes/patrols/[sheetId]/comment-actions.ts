'use server'

import { revalidatePath }       from 'next/cache'
import { getAdminSupabase, requireActor as requireOrgAccess } from '@/sdk'

const supabaseAdmin = getAdminSupabase()

export type CommentActionResult = { error?: string; success?: boolean }

/**
 * シートにコメント投稿。
 *
 * formData:
 *   - body                 (required)
 *   - mentioned_user_ids   ('id1,id2,...' カンマ区切り)
 *   - requires_response    ('true' なら返答必須)
 */
export async function postCommentAction(
  slug: string,
  sheetId: string,
  formData: FormData,
): Promise<CommentActionResult> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  const body = ((formData.get('body') as string) ?? '').trim()
  if (!body) return { error: 'コメントを入力してください' }

  const requires_response = formData.get('requires_response') === 'true'

  const mentionedRaw = (formData.get('mentioned_user_ids') as string) ?? ''
  const mentionedIds = mentionedRaw.split(',').map((s) => s.trim()).filter(Boolean)

  // mentioned ユーザーの display_name を解決して snapshot 保存
  let mentionedNames: string[] = []
  if (mentionedIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .eq('organization_id', actor.organizationId)
      .in('id', mentionedIds)
    const idToName = new Map<string, string>()
    for (const p of (profiles as Array<{ id: string; display_name: string | null }> | null) ?? []) {
      idToName.set(p.id, p.display_name ?? p.id)
    }
    mentionedNames = mentionedIds.map((id) => idToName.get(id) ?? id)
  }

  // シートが actor の組織に属するか検証
  const { data: sheet } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('organization_id')
    .eq('id', sheetId)
    .single()
  if (!sheet || sheet.organization_id !== actor.organizationId) {
    return { error: 'このシートにコメントできません' }
  }

  // 投稿
  const { error } = await supabaseAdmin
    .from('patrol_sheet_comments')
    .insert({
      organization_id:       actor.organizationId,
      sheet_id:              sheetId,
      author_user_id:        actor.id,
      author_name_snapshot:  actor.actorName,
      body,
      mentioned_user_ids:    mentionedIds,
      mentioned_user_names:  mentionedNames,
      requires_response,
    })
  if (error) return { error: error.message }

  // 自分が mentioned されていた未解決の「返答待ち」コメントを解決済みに。
  // .contains() が Studio mock では未対応なので、JS で配列メンバ判定。
  const { data: openCmts } = await supabaseAdmin
    .from('patrol_sheet_comments')
    .select('id, mentioned_user_ids')
    .eq('sheet_id', sheetId)
    .eq('requires_response', true)
    .is('resolved_at', null)
  const toResolve = ((openCmts as Array<{ id: string; mentioned_user_ids: string[] }> | null) ?? [])
    .filter((c) => c.mentioned_user_ids?.includes(actor.id))
    .map((c) => c.id)
  if (toResolve.length > 0) {
    await supabaseAdmin
      .from('patrol_sheet_comments')
      .update({ resolved_at: new Date().toISOString() })
      .in('id', toResolve)
  }

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}`)
  return { success: true }
}
