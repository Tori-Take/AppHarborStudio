import { readdirSync, readFileSync, statSync, existsSync, realpathSync } from 'fs'
import { resolve, join } from 'path'
import { resolveCartridgesPath } from './config'

/**
 * junction / symlink を解決して実体パスを返す。
 * 解決に失敗したら入力パスをそのまま返す。
 */
function resolveRealPath(p: string): string {
  try { return realpathSync(p) } catch { return p }
}

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
  /** true なら本体 chrome を隠して全画面表示する（本体 lib/cartridge/spec.ts と同期） */
  fullscreen?:  boolean
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

/**
 * カートリッジを 3 ソースから収集（優先度高い順）:
 *   1. cartridges/_local/<id>/        ← 開発中
 *   2. cartridges/_installed/<id>/    ← GitHub から fetch
 *   3. cartridges/<id>/                ← レガシー直置き（後方互換）
 *
 * 同 id が複数ソースにある場合は上の順で優先（_local が勝つ）。
 */
function collectCartridgePaths(root: string): Map<string, string> {
  const seen = new Map<string, string>()  // id -> absolute path
  const sources = [
    join(root, '_local'),
    join(root, '_installed'),
    root,
  ]
  for (const src of sources) {
    if (!existsSync(src)) continue
    for (const name of readdirSync(src)) {
      if (name.startsWith('_') || name.startsWith('.')) continue
      const full = join(src, name)
      try { if (!statSync(full).isDirectory()) continue } catch { continue }
      if (!existsSync(join(full, 'manifest.json'))) continue
      if (seen.has(name)) continue
      seen.set(name, full)
    }
  }
  return seen
}

export function scanCartridges(): CartridgeEntry[] {
  const root = resolveCartridgesPath()
  if (!existsSync(root)) return []

  const entries: CartridgeEntry[] = []
  for (const [name, full] of collectCartridgePaths(root)) {
    const manifestPath = join(full, 'manifest.json')

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
      path:      resolveRealPath(full),  // junction を実体パスに解決
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
