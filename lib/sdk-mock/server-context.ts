/**
 * サーバー側のコンテキスト解決
 *
 * Studio はクライアント側の zustand で仮ユーザーを切替えるが、
 * Server Component / Server Action からはその状態を直接読めない。
 * → Cookie 'studio_user_id' で同期する。
 *
 * クライアント側 (RoleSwitcher) が onChange で Cookie に書き込み、
 * サーバー側はリクエスト Cookie から現在のユーザーを判定する。
 */

import { cookies } from 'next/headers'
import { DEFAULT_ORG, DEFAULT_USERS, STUDIO_USER_COOKIE } from './store'
import type { MockOrg, MockUser } from './types'

export async function getCurrentMockUserServer(): Promise<MockUser> {
  try {
    const c  = await cookies()
    const id = c.get(STUDIO_USER_COOKIE)?.value
    if (id) {
      const u = DEFAULT_USERS.find((x) => x.id === id)
      if (u) return u
    }
  } catch {
    // cookies() が使えない環境では default に fallback
  }
  return DEFAULT_USERS[0]
}

export function getMockOrgServer(): MockOrg {
  return DEFAULT_ORG
}
