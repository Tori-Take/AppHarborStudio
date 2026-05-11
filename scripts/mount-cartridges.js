#!/usr/bin/env node
/**
 * mount-cartridges.js
 *
 * カートリッジを Studio の Next.js ルーティング配下にマウント（コピー）する。
 *
 *   <cartridges>/{id}/routes/* → studio/app/play/[slug]/{id}/*
 *
 * これにより /play/studio-sandbox/typingdash で typingdash の routes/page.tsx が
 * Next.js の通常のページとして配信される。
 *
 * AppHarbor 本体の installer.ts と同じ思想（routes をアプリパスにコピー）。
 */

const fs = require('fs')
const path = require('path')

const STUDIO_ROOT = path.resolve(__dirname, '..')
// AppHarbor 本体と同じ URL 構造でマウントする:
//   /org/[slug]/apps/{appId}/...
// → カートリッジ内のハードコードされた "/org/{slug}/apps/{appId}" パスがそのまま機能する
const PLAY_BASE   = path.join(STUDIO_ROOT, 'app', 'org', '[slug]', 'apps')

function resolveCartridgesRoot() {
  if (process.env.STUDIO_CARTRIDGES_PATH) {
    return path.resolve(STUDIO_ROOT, process.env.STUDIO_CARTRIDGES_PATH)
  }
  const local = path.join(STUDIO_ROOT, 'cartridges')
  if (fs.existsSync(local)) return local
  const parent = path.resolve(STUDIO_ROOT, '..', 'cartridges')
  if (fs.existsSync(parent)) return parent
  return path.join(STUDIO_ROOT, 'workspace')
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name)
    const d = path.join(dest, name)
    const stat = fs.statSync(s)
    if (stat.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return
  fs.rmSync(dir, { recursive: true, force: true })
}

function isCartridgeFolder(name) {
  return !name.startsWith('_') && !name.startsWith('.')
}

/**
 * カートリッジディレクトリを 3 ソースから走査:
 *   1. cartridges/_local/<id>/        ← 開発中（最優先）
 *   2. cartridges/_installed/<id>/    ← GitHub から fetch
 *   3. cartridges/<id>/                ← レガシー直置き（後方互換）
 *
 * 同 id が複数ソースにある場合は上の順で優先。
 */
function collectCartridges(root) {
  const seen = new Map()  // id -> absolutePath
  const sources = [
    path.join(root, '_local'),
    path.join(root, '_installed'),
    root,
  ]
  for (const src of sources) {
    if (!fs.existsSync(src)) continue
    for (const name of fs.readdirSync(src)) {
      if (!isCartridgeFolder(name)) continue
      const full = path.join(src, name)
      if (!fs.statSync(full).isDirectory()) continue
      if (!fs.existsSync(path.join(full, 'manifest.json'))) continue
      if (seen.has(name)) continue
      seen.set(name, full)
    }
  }
  return seen
}

function main() {
  const root = resolveCartridgesRoot()
  if (!fs.existsSync(root)) {
    console.log(`[mount-cartridges] カートリッジ置き場がありません: ${root}`)
    return
  }

  console.log('[mount-cartridges] root:', root)
  console.log('[mount-cartridges] dest:', PLAY_BASE)

  // [slug] フォルダを作成（既存があれば中の各カートリッジを一旦削除）
  fs.mkdirSync(PLAY_BASE, { recursive: true })

  // 既存マウント済みカートリッジを掃除（page.tsx は残す）
  for (const name of fs.readdirSync(PLAY_BASE)) {
    const full = path.join(PLAY_BASE, name)
    if (fs.statSync(full).isDirectory()) rmDir(full)
  }

  let mounted = 0
  let skipped = 0
  for (const [name, cartridgeDir] of collectCartridges(root)) {
    const routesDir = path.join(cartridgeDir, 'routes')
    if (!fs.existsSync(routesDir)) {
      console.log(`  ⚠ ${name}: routes/ がないためスキップ`)
      skipped++
      continue
    }

    // studioCompatible: false のカートリッジはマウントしない
    const manifestPath = path.join(cartridgeDir, 'manifest.json')
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (manifest.studioCompatible === false) {
          console.log(`  ⚠ ${name}: studioCompatible: false のためスキップ`)
          skipped++
          continue
        }
      } catch {
        // manifest が読めない場合はそのまま進める
      }
    }

    const dest = path.join(PLAY_BASE, name)
    copyDir(routesDir, dest)
    console.log(`  ✅ ${name} → app/org/[slug]/apps/${name}/`)
    mounted++
  }

  console.log('')
  console.log(`[mount-cartridges] mounted=${mounted}, skipped=${skipped}`)
}

main()
