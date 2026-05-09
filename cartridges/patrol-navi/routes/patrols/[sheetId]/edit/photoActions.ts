'use server'

import { getAdminSupabase, getAppRole } from '@/sdk'
const supabaseAdmin = getAdminSupabase()
import { revalidatePath } from 'next/cache'
import { requireActor as requireOrgAccess } from '@/sdk'
import { isPatrolAdmin } from '../../../_helpers/patrolRole'

const BUCKET = 'patrol-attachments'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const ALLOWED_EXT_MIME: Record<string, string[]> = {
  jpg:  ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png:  ['image/png'],
  webp: ['image/webp'],
  heic: ['image/heic'],
  heif: ['image/heif'],
}

export type PhotoActionResult = {
  error?:    string
  photoUrls?: string[]   // 更新後の path 配列
}

// シート所有検証（共通）
async function verifySheetItem(
  slug:    string,
  sheetId: string,
  itemId:  string,
): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { ok: false, error: guard.error }
  const { actor } = guard

  const { data: row } = await supabaseAdmin
    .from('patrol_sheet_items')
    .select('id, sheet_id, patrol_check_sheets!inner(organization_id, status, patroller_id)')
    .eq('id', itemId)
    .eq('sheet_id', sheetId)
    .single()

  if (!row) return { ok: false, error: '項目が見つかりません' }
  const sheet = (row as { patrol_check_sheets: { organization_id: string; status: string; patroller_id: string } | { organization_id: string; status: string; patroller_id: string }[] }).patrol_check_sheets
  const s = Array.isArray(sheet) ? sheet[0] : sheet
  if (!s || s.organization_id !== actor.organizationId) {
    return { ok: false, error: 'このシートにアクセスする権限がありません' }
  }
  // draft/remanded のみ編集可。admin でも in_progress / completed では不可
  if (s.status !== 'draft' && s.status !== 'remanded') {
    return { ok: false, error: 'このシートは編集できません（draft/remanded のみ編集可）' }
  }
  const role = await getAppRole({
    organizationId: actor.organizationId,
    userId:         actor.id,
    departmentId:   actor.departmentId,
    appId:          'patrol-navi',
  })
  if (!isPatrolAdmin(role) && s.patroller_id !== actor.id) {
    return { ok: false, error: '権限がありません' }
  }
  return { ok: true, orgId: s.organization_id }
}

export async function uploadPatrolPhotoAction(
  slug:    string,
  sheetId: string,
  itemId:  string,
  formData: FormData,
): Promise<PhotoActionResult> {
  const v = await verifySheetItem(slug, sheetId, itemId)
  if (!v.ok) return { error: v.error }

  const file = formData.get('photo') as File | null
  if (!file || file.size === 0) return { error: 'ファイルが選択されていません' }
  if (file.size > MAX_FILE_SIZE) return { error: 'ファイルサイズが10MBを超えています' }

  const rawExt = file.name.includes('.') ? file.name.split('.').pop() ?? '' : ''
  const ext = rawExt.toLowerCase()
  if (!ext || !/^[a-z0-9]+$/.test(ext)) return { error: '拡張子が不正です' }
  const allowed = ALLOWED_EXT_MIME[ext]
  if (!allowed) return { error: `許可されていない拡張子です（.${ext}）` }
  if (!allowed.includes(file.type)) return { error: 'ファイル形式と拡張子が一致しません' }

  const uuid = crypto.randomUUID()
  const path = `${v.orgId}/${sheetId}/${itemId}/${uuid}.${ext}`

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })
  if (uploadErr) return { error: 'アップロードに失敗しました' }

  // photo_urls に append
  const { data: cur } = await supabaseAdmin
    .from('patrol_sheet_items')
    .select('photo_urls')
    .eq('id', itemId)
    .single()
  const next = [...((cur?.photo_urls as string[] | null) ?? []), path]

  const { error: updErr } = await supabaseAdmin
    .from('patrol_sheet_items')
    .update({ photo_urls: next })
    .eq('id', itemId)
  if (updErr) {
    // ロールバック
    await supabaseAdmin.storage.from(BUCKET).remove([path])
    return { error: '保存に失敗しました' }
  }

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}/edit`)
  return { photoUrls: next }
}

export async function deletePatrolPhotoAction(
  slug:    string,
  sheetId: string,
  itemId:  string,
  path:    string,
): Promise<PhotoActionResult> {
  const v = await verifySheetItem(slug, sheetId, itemId)
  if (!v.ok) return { error: v.error }

  // path がこの sheet/item 配下であることを検証（パストラバーサル防止）
  const expectedPrefix = `${v.orgId}/${sheetId}/${itemId}/`
  if (!path.startsWith(expectedPrefix) || path.includes('..')) {
    return { error: '不正なパスです' }
  }

  const { data: cur } = await supabaseAdmin
    .from('patrol_sheet_items')
    .select('photo_urls')
    .eq('id', itemId)
    .single()
  const list = (cur?.photo_urls as string[] | null) ?? []
  if (!list.includes(path)) return { error: '対象の写真が見つかりません' }

  const next = list.filter(p => p !== path)
  const { error: updErr } = await supabaseAdmin
    .from('patrol_sheet_items')
    .update({ photo_urls: next })
    .eq('id', itemId)
  if (updErr) return { error: '削除に失敗しました' }

  await supabaseAdmin.storage.from(BUCKET).remove([path])

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}/edit`)
  return { photoUrls: next }
}

// ─── シートレベルの写真（パトロールコメント添付用） ─────────────
async function verifySheet(
  slug:    string,
  sheetId: string,
): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { ok: false, error: guard.error }
  const { actor } = guard

  const { data: sheet } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('organization_id, status, patroller_id')
    .eq('id', sheetId)
    .single()

  if (!sheet) return { ok: false, error: 'シートが見つかりません' }
  if (sheet.organization_id !== actor.organizationId) {
    return { ok: false, error: 'このシートにアクセスする権限がありません' }
  }
  // draft/remanded のみ編集可。admin でも in_progress / completed では不可
  if (sheet.status !== 'draft' && sheet.status !== 'remanded') {
    return { ok: false, error: 'このシートは編集できません（draft/remanded のみ編集可）' }
  }
  const role = await getAppRole({
    organizationId: actor.organizationId,
    userId:         actor.id,
    departmentId:   actor.departmentId,
    appId:          'patrol-navi',
  })
  if (!isPatrolAdmin(role) && sheet.patroller_id !== actor.id) {
    return { ok: false, error: '権限がありません' }
  }
  return { ok: true, orgId: sheet.organization_id as string }
}

export async function uploadSheetPhotoAction(
  slug:    string,
  sheetId: string,
  formData: FormData,
): Promise<PhotoActionResult> {
  const v = await verifySheet(slug, sheetId)
  if (!v.ok) return { error: v.error }

  const file = formData.get('photo') as File | null
  if (!file || file.size === 0) return { error: 'ファイルが選択されていません' }
  if (file.size > MAX_FILE_SIZE) return { error: 'ファイルサイズが10MBを超えています' }

  const rawExt = file.name.includes('.') ? file.name.split('.').pop() ?? '' : ''
  const ext = rawExt.toLowerCase()
  if (!ext || !/^[a-z0-9]+$/.test(ext)) return { error: '拡張子が不正です' }
  const allowed = ALLOWED_EXT_MIME[ext]
  if (!allowed) return { error: `許可されていない拡張子です（.${ext}）` }
  if (!allowed.includes(file.type)) return { error: 'ファイル形式と拡張子が一致しません' }

  const uuid = crypto.randomUUID()
  // sheet レベル写真は _sheet という固定セグメントで item レベルと区別
  const path = `${v.orgId}/${sheetId}/_sheet/${uuid}.${ext}`

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })
  if (uploadErr) return { error: 'アップロードに失敗しました' }

  const { data: cur } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('feedback_photo_urls')
    .eq('id', sheetId)
    .single()
  const next = [...((cur?.feedback_photo_urls as string[] | null) ?? []), path]

  const { error: updErr } = await supabaseAdmin
    .from('patrol_check_sheets')
    .update({ feedback_photo_urls: next })
    .eq('id', sheetId)
  if (updErr) {
    await supabaseAdmin.storage.from(BUCKET).remove([path])
    return { error: '保存に失敗しました' }
  }

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}/edit`)
  return { photoUrls: next }
}

export async function deleteSheetPhotoAction(
  slug:    string,
  sheetId: string,
  path:    string,
): Promise<PhotoActionResult> {
  const v = await verifySheet(slug, sheetId)
  if (!v.ok) return { error: v.error }

  const expectedPrefix = `${v.orgId}/${sheetId}/_sheet/`
  if (!path.startsWith(expectedPrefix) || path.includes('..')) {
    return { error: '不正なパスです' }
  }

  const { data: cur } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('feedback_photo_urls')
    .eq('id', sheetId)
    .single()
  const list = (cur?.feedback_photo_urls as string[] | null) ?? []
  if (!list.includes(path)) return { error: '対象の写真が見つかりません' }

  const next = list.filter(p => p !== path)
  const { error: updErr } = await supabaseAdmin
    .from('patrol_check_sheets')
    .update({ feedback_photo_urls: next })
    .eq('id', sheetId)
  if (updErr) return { error: '削除に失敗しました' }

  await supabaseAdmin.storage.from(BUCKET).remove([path])

  revalidatePath(`/org/${slug}/apps/patrol-navi/patrols/${sheetId}/edit`)
  return { photoUrls: next }
}

// 表示用 signed URL を一括取得（編集・閲覧画面共通）
export async function getPatrolPhotoUrlsAction(
  slug:    string,
  sheetId: string,
  paths:   string[],
): Promise<{ urls?: Record<string, string>; error?: string }> {
  const guard = await requireOrgAccess(slug, 'member')
  if (!guard.ok) return { error: guard.error }
  const { actor } = guard

  // sheet 所属検証
  const { data: sheet } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('organization_id')
    .eq('id', sheetId)
    .single()
  if (!sheet || sheet.organization_id !== actor.organizationId) {
    return { error: 'このシートにアクセスする権限がありません' }
  }

  // path が org 配下であるかチェック
  const safe = paths.filter(p => p.startsWith(`${sheet.organization_id}/${sheetId}/`) && !p.includes('..'))

  const urls: Record<string, string> = {}
  for (const p of safe) {
    const { data } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(p, 60 * 30) // 30分
    if (data?.signedUrl) urls[p] = data.signedUrl
  }
  return { urls }
}
