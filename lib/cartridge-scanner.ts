import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { resolveCartridgesPath } from './config'

/** カートリッジ manifest.json の権限定義（オブジェクト形式） */
export type ManifestPermission = {
  id:       string
  label?:   string
  default?: boolean
}

export type CartridgeManifest = {
  id:           string
  /** 表示名。historical に displayName と name の両方が混在 */
  displayName?: string
  name?:        string
  description?: string
  version?:     string
  /** 文字列配列 or オブジェクト配列の両形式を許容 */
  permissions?: string[] | ManifestPermission[]
  defaultPermission?: string | null
  /** PGlite 互換でないカートリッジを Studio から除外する */
  studioCompatible?: boolean
  /** studioCompatible: false 時に詳細ページで表示する説明文 */
  studioCompatibleNote?: string
  /** Supabase テーブル名のプレフィックス（衝突回避用） */
  tablePrefix?: string
  /** schema.sql で作成するテーブル名一覧 */
  tables?:      string[]
  /** その他の任意フィールド */
  [key: string]: unknown
}

export type CartridgeEntry = {
  id:        string
  path:      string
  manifest:  CartridgeManifest | null
  hasRoutes: boolean
  hasDb:     boolean
  error?:    string
}

export function scanCartridges(): CartridgeEntry[] {
  const root = resolveCartridgesPath()
  if (!existsSync(root)) return []

  const entries: CartridgeEntry[] = []
  for (const name of readdirSync(root)) {
    if (name.startsWith('_') || name.startsWith('.')) continue
    const full = join(root, name)
    let isDir = false
    try { isDir = statSync(full).isDirectory() } catch { continue }
    if (!isDir) continue

    const manifestPath = join(full, 'manifest.json')
    // manifest.json が存在しないフォルダは一覧に出さない
    // （削除残骸の空フォルダや作りかけの除外）
    if (!existsSync(manifestPath)) continue

    let manifest: CartridgeManifest | null = null
    let error: string | undefined
    try {
      const raw = readFileSync(manifestPath, 'utf-8')
      manifest = JSON.parse(raw) as CartridgeManifest
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }

    entries.push({
      id:        manifest?.id ?? name,
      path:      full,
      manifest,
      hasRoutes: existsSync(join(full, 'routes')),
      hasDb:     existsSync(join(full, 'db')),
      error,
    })
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id))
}

export function getCartridge(id: string): CartridgeEntry | null {
  return scanCartridges().find((c) => c.id === id) ?? null
}

export function getCartridgesRoot(): string {
  return resolveCartridgesPath()
}
