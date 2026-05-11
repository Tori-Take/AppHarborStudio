#!/usr/bin/env node
/**
 * cartridges-registry.yaml を読み、GitHub からカートリッジを clone する。
 *
 * - mode: installed   → cartridges/_installed/<id>/ に clone (毎回 fresh)
 * - mode: local       → 何もしない (path 配下を手動編集)
 * - enabled: false    → スキップ
 *
 * 配置ルール（pg.ts の resolveCartridgesRoot と同等）:
 *   1. 環境変数 STUDIO_CARTRIDGES_PATH
 *   2. ./cartridges (Studio が単独配置されている場合)
 *   3. ../cartridges (AppHarbor 内の studio/ で動作している場合)
 *   4. ./workspace (フォールバック)
 *
 * registry の場所: 上記 cartridges/ と同じディレクトリ階層 (= 親)。
 *
 * predev / prebuild で自動実行される想定。
 * 認証: 環境変数 GITHUB_TOKEN があれば https://x-access-token:<TOKEN>@github.com/... を使う。
 */

const fs   = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const STUDIO_ROOT = path.resolve(__dirname, '..')

function resolveCartridgesRoot() {
  if (process.env.STUDIO_CARTRIDGES_PATH) {
    return path.resolve(STUDIO_ROOT, process.env.STUDIO_CARTRIDGES_PATH)
  }
  const local  = path.join(STUDIO_ROOT, 'cartridges')
  if (fs.existsSync(local)) return local
  const parent = path.resolve(STUDIO_ROOT, '..', 'cartridges')
  if (fs.existsSync(parent)) return parent
  return path.join(STUDIO_ROOT, 'workspace')
}

const CART_ROOT     = resolveCartridgesRoot()
const INSTALLED_DIR = path.join(CART_ROOT, '_installed')
const REGISTRY_PATH = path.join(path.dirname(CART_ROOT), 'cartridges-registry.yaml')

function log(msg) { console.log(`[fetch-cartridges] ${msg}`) }

// 最低限の YAML パーサ（外部依存を避ける）
function parseRegistry(text) {
  const cartridges = []
  let current = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trimEnd()
    if (!line.trim()) continue
    const m1 = line.match(/^\s+- id:\s*(.+)$/)
    if (m1) {
      if (current) cartridges.push(current)
      current = { id: m1[1].trim() }
      continue
    }
    if (!current) continue
    const m2 = line.match(/^\s+(\w+):\s*(.+)$/)
    if (m2) {
      const v = m2[2].trim()
      current[m2[1]] = v === 'true' ? true : v === 'false' ? false : v
    }
  }
  if (current) cartridges.push(current)
  return { cartridges }
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }) }
function rmDir(dir) { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }) }

function gitUrl(repo) {
  const token = process.env.GITHUB_TOKEN
  return token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`
}

function cloneCart(c) {
  const dest = path.join(INSTALLED_DIR, c.id)
  rmDir(dest)
  const ref = c.ref ?? 'main'
  log(`📦 ${c.id} ← ${c.repo}@${ref}`)
  execSync(
    `git clone --depth 1 --branch ${ref} ${gitUrl(c.repo)} "${dest}"`,
    { stdio: 'inherit' },
  )
  // .git は不要なので削除
  rmDir(path.join(dest, '.git'))
}

function main() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    log(`registry なし (${REGISTRY_PATH}) — スキップ`)
    return
  }
  log(`registry: ${REGISTRY_PATH}`)
  log(`cartridges root: ${CART_ROOT}`)

  const registry = parseRegistry(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  ensureDir(INSTALLED_DIR)

  const targets = registry.cartridges.filter(c => c.enabled !== false)
  if (targets.length === 0) {
    log('対象カートリッジなし')
    return
  }

  let installed = 0
  for (const c of targets) {
    if (c.mode === 'local') {
      log(`📂 ${c.id} (local: ${c.path}) — スキップ`)
      continue
    }
    if (c.mode !== 'installed') {
      log(`⚠️  ${c.id} は mode 不正 (${c.mode}) — スキップ`)
      continue
    }
    if (!c.repo) {
      log(`⚠️  ${c.id} は repo 未指定 — スキップ`)
      continue
    }
    try {
      cloneCart(c)
      installed++
    } catch (e) {
      log(`❌ ${c.id} の clone 失敗: ${e.message}`)
    }
  }

  log(`✅ ${installed} カートリッジ取得完了`)
}

main()
