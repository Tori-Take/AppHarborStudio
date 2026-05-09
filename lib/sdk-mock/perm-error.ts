/**
 * StudioPermError — クライアント / サーバー両方から使える
 * 純粋ユーティリティ（next/headers 等を import しない）。
 *
 * requireApp / requireActor が throw する Error の message に
 * 構造化 payload を JSON で埋めることで、error.tsx (client) から
 * 復元できるようにする。
 */

import type { OrgRole } from './types'

export type StudioPermErrorPayload = {
  kind:        'org-access' | 'role-missing' | 'role-check-failed'
  appId?:      string
  userId:      string
  userName:    string
  orgRole:     OrgRole
  appRole:     string | null
  hint:        string
}

const STUDIO_PERM_ERR_PREFIX = '__STUDIO_PERM_ERR__:'

export function isStudioPermError(message: string): StudioPermErrorPayload | null {
  if (!message.startsWith(STUDIO_PERM_ERR_PREFIX)) return null
  try {
    return JSON.parse(message.slice(STUDIO_PERM_ERR_PREFIX.length)) as StudioPermErrorPayload
  } catch { return null }
}

export function buildStudioPermErrorMessage(payload: StudioPermErrorPayload): string {
  return STUDIO_PERM_ERR_PREFIX + JSON.stringify(payload)
}
