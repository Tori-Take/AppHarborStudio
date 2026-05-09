/**
 * Studio 上の「アプリ別ユーザーロール上書き」永続化レイヤー。
 *
 * Studio で起動したカートリッジでは、各ユーザーごとに以下を解決する:
 *   1. .studio-db/app-permissions.json に保存された明示的な上書き
 *   2. なければ manifest.permissions[default=true].id (= カートリッジの既定ロール)
 *   3. それも無ければ 'member'
 *
 * このファイルは server only（fs を使う）。
 *
 * Studio-only: 本番 AppHarbor では `apps.default_permission` が同等の役割を持つ。
 *              ここでの設定は本番に同期されない。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { getCartridge } from '../cartridge-scanner'

export const PERM_FILE = join(process.cwd(), '.studio-db', 'app-permissions.json')

// shape: { [appId]: { [userId]: roleId } }
export type PermMap = Record<string, Record<string, string>>

function safeRead(): PermMap {
  try {
    if (!existsSync(PERM_FILE)) return {}
    const raw = readFileSync(PERM_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object') ? parsed as PermMap : {}
  } catch {
    return {}
  }
}

function safeWrite(map: PermMap): void {
  mkdirSync(dirname(PERM_FILE), { recursive: true })
  writeFileSync(PERM_FILE, JSON.stringify(map, null, 2), 'utf8')
}

/** 全アプリ分を返す（Permission Panel が一覧表示するため） */
export function getAllPermissions(): PermMap {
  return safeRead()
}

/** 指定アプリ + ユーザーの role override を返す（無ければ null） */
export function getOverrideRole(appId: string, userId: string): string | null {
  const map = safeRead()
  return map[appId]?.[userId] ?? null
}

/** role を設定 (空文字 / null で削除) */
export function setOverrideRole(appId: string, userId: string, role: string | null): void {
  const map = safeRead()
  if (!map[appId]) map[appId] = {}
  if (role && role !== '') {
    map[appId][userId] = role
  } else {
    delete map[appId][userId]
  }
  safeWrite(map)
}

/**
 * カートリッジの既定ロールを取得 (manifest.permissions[default=true].id)。
 * 見つからなければ null。
 */
export function getManifestDefaultRole(appId: string): string | null {
  const c = getCartridge(appId)
  const perms = c?.manifest?.permissions ?? []
  for (const p of perms) {
    if (typeof p === 'object' && p && p.default) return p.id
  }
  return null
}

/**
 * 指定アプリの自動初期化:
 *   - 既に entry が存在する場合は no-op
 *   - 存在しない場合: 「先頭ユーザーに admin 相当ロール」を付与
 *     （manifest に admin が無い場合は既定ロール）
 *
 * 第二引数で「先頭ユーザー」の id を渡す（呼び出し側で DEFAULT_USERS[0] を渡す想定）。
 *
 * 戻り値: 初期化したかどうか。
 */
export function initAppPermissions(appId: string, topUserId: string): boolean {
  const map = safeRead()
  if (map[appId]) return false  // 既に初期化済み

  const c = getCartridge(appId)
  const perms = c?.manifest?.permissions ?? []
  // admin ロールがあればそれ、なければ既定ロール、それも無ければ 'admin'
  const adminRole =
    perms.find((p) => typeof p === 'object' && p && p.id === 'admin')
      ? 'admin'
      : (perms.find((p) => typeof p === 'object' && p && p.default) as { id?: string } | undefined)?.id
        ?? 'admin'

  map[appId] = { [topUserId]: adminRole }
  safeWrite(map)
  return true
}

/** 指定アプリの設定を全削除 (= 次回 init で田中=admin に戻る) */
export function resetAppPermissions(appId: string): void {
  const map = safeRead()
  delete map[appId]
  safeWrite(map)
}
