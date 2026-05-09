#!/usr/bin/env node
/**
 * init-project.js
 *
 * Studio フォルダを別プロジェクトとして外部にクローンするスクリプト。
 *
 * 使い方:
 *   node scripts/init-project.js <宛先パス> [カートリッジID]
 *
 * 例:
 *   node scripts/init-project.js ~/Projects/my-cartridge my-cart
 *
 * 動作:
 *   1. Studio フォルダ（このフォルダ）を <宛先パス> にコピー
 *   2. node_modules / .next / .studio-db / app/org/[slug]/apps/{動的} を除外
 *   3. workspace/{カートリッジID}/ にカートリッジ skeleton を生成（任意）
 *   4. 宛先で `npm install && npm run dev` で開発開始
 */

const fs = require('fs')
const path = require('path')

const STUDIO_ROOT = path.resolve(__dirname, '..')

const EXCLUDE = new Set([
  'node_modules', '.next', '.studio-db', '.git',
])
// app/org/[slug]/apps/ 配下のマウント済みカートリッジは除外（再生成される）
function shouldSkip(abs) {
  const rel = path.relative(STUDIO_ROOT, abs).replace(/\\/g, '/')
  if (rel.startsWith('app/org/[slug]/apps/') && rel !== 'app/org/[slug]/apps/page.tsx') {
    const segs = rel.split('/')
    if (segs.length >= 5) return true   // app/org/[slug]/apps/{id}/...
  }
  return false
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    if (EXCLUDE.has(name)) continue
    const s = path.join(src, name)
    const d = path.join(dest, name)
    if (shouldSkip(s)) continue
    const stat = fs.statSync(s)
    if (stat.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function renderCartridgeTemplate(template, ctx) {
  return template
    .replace(/\{\{CARTRIDGE_ID\}\}/g,    ctx.id)
    .replace(/\{\{CARTRIDGE_NAME\}\}/g,  ctx.name)
    .replace(/\{\{TABLE_PREFIX\}\}/g,    ctx.tablePrefix)
    .replace(/\{\{PERMISSIONS_LIST\}\}/g, ctx.permissionsList)
}

function generateCartridgeSkeleton(workspaceDir, id) {
  const dir = path.join(workspaceDir, id)
  fs.mkdirSync(path.join(dir, 'routes', 'components'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'routes', 'server'),     { recursive: true })
  fs.mkdirSync(path.join(dir, 'db'),                    { recursive: true })

  const manifest = {
    $schema: 'https://appharbor.app/cartridge-schema-v1.json',
    spec_version: '1',
    id,
    version: '0.1.0',
    name: id,
    description: '新規カートリッジ',
    icon: '📦',
    category: 'その他',
    studioCompatible: true,
    appharbor: { sdkVersion: '^1.0', minPlatformVersion: '0.5.0' },
    permissions: [
      { id: 'viewer', label: '閲覧者', default: true, description: '閲覧のみ' },
      { id: 'admin',  label: '管理者', description: '全操作' },
    ],
    navigation: [
      { label: 'ホーム', path: '/', icon: 'Home', minRole: 'viewer' },
    ],
    tablePrefix: id.replace(/-/g, '_'),
    tables: [],
    depends: [], emits: [], subscribes: [],
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  fs.writeFileSync(path.join(dir, 'routes', 'page.tsx'),
`import { requireApp } from '@/sdk'

export default async function HomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await requireApp(slug, '${id}')
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, color: '#e2e8f0' }}>
      <h1>${id}</h1>
      <p>こんにちは、{ctx.actor.actorName} さん（role: {ctx.role}）</p>
    </main>
  )
}
`)

  const tablePrefix = id.replace(/-/g, '_')
  fs.writeFileSync(path.join(dir, 'db', 'schema.sql'),
`-- ${id} スキーマ（Studio 起動時に自動適用される）
-- 重要: 全テーブルに organization_id を含める / RLS を有効化する

-- create table if not exists ${tablePrefix}_items (
--   id              uuid primary key default gen_random_uuid(),
--   organization_id uuid not null references organizations(id) on delete cascade,
--   created_at      timestamptz not null default now()
-- );
`)

  // カートリッジ用 CLAUDE.md
  const cartridgeTplPath = path.join(STUDIO_ROOT, 'templates', 'CLAUDE.cartridge.md')
  if (fs.existsSync(cartridgeTplPath)) {
    const tpl = fs.readFileSync(cartridgeTplPath, 'utf-8')
    const rendered = renderCartridgeTemplate(tpl, {
      id,
      name:  id,
      tablePrefix,
      permissionsList: '- viewer (default) — 閲覧者\n- admin — 管理者',
    })
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), rendered)
  }

  console.log(`  ✅ workspace/${id}/  skeleton を生成`)
}

function main() {
  const [destArg, cartridgeId] = process.argv.slice(2)
  if (!destArg) {
    console.error('使い方: node scripts/init-project.js <宛先パス> [カートリッジID]')
    process.exit(1)
  }

  const dest = path.resolve(destArg)
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    console.error(`宛先が空ではありません: ${dest}`)
    process.exit(1)
  }

  console.log('[init-project] Studio をコピー中...')
  console.log(`  src:  ${STUDIO_ROOT}`)
  console.log(`  dest: ${dest}`)
  copyDir(STUDIO_ROOT, dest)
  console.log('[init-project] コピー完了')

  // プロジェクト用 CLAUDE.md を配置
  const projectTpl = path.join(STUDIO_ROOT, 'templates', 'CLAUDE.project.md')
  if (fs.existsSync(projectTpl)) {
    const claudeMd = path.join(dest, 'CLAUDE.md')
    if (!fs.existsSync(claudeMd)) {
      fs.copyFileSync(projectTpl, claudeMd)
      console.log('  ✅ CLAUDE.md を配置（Claude Code 向け指示）')
    }
  }

  if (cartridgeId) {
    if (!/^[a-z][a-z0-9-]*$/.test(cartridgeId)) {
      console.error(`カートリッジ ID は小文字英数とハイフンのみ: ${cartridgeId}`)
      process.exit(1)
    }
    const workspaceDir = path.join(dest, 'workspace')
    fs.mkdirSync(workspaceDir, { recursive: true })
    generateCartridgeSkeleton(workspaceDir, cartridgeId)
  }

  console.log('')
  console.log('次のステップ:')
  console.log(`  cd ${dest}`)
  console.log('  npm install')
  console.log('  npm run dev')
  console.log('')
  console.log('Studio は http://localhost:3100 で開きます')
  console.log('カートリッジは workspace/ 配下を自動的に読み込みます')
}

main()
