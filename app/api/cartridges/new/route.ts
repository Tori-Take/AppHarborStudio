import { NextResponse } from 'next/server'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { resolveCartridgesPath } from '@/lib/config'

function renderCartridgeClaudeMd(ctx: { id: string; name: string; tablePrefix: string; permissionsList: string }): string | null {
  const tpl = join(process.cwd(), 'templates', 'CLAUDE.cartridge.md')
  if (!existsSync(tpl)) return null
  return readFileSync(tpl, 'utf-8')
    .replace(/\{\{CARTRIDGE_ID\}\}/g,     ctx.id)
    .replace(/\{\{CARTRIDGE_NAME\}\}/g,   ctx.name)
    .replace(/\{\{TABLE_PREFIX\}\}/g,     ctx.tablePrefix)
    .replace(/\{\{PERMISSIONS_LIST\}\}/g, ctx.permissionsList)
}

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,40}$/

export async function POST(req: Request) {
  let body: { id?: string; name?: string; description?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const id = (body.id ?? '').trim()
  if (!NAME_PATTERN.test(id)) {
    return NextResponse.json({ error: 'id は小文字英数とハイフン (2〜40文字、先頭は英字)' }, { status: 400 })
  }

  const root = resolveCartridgesPath()
  const dir  = join(root, id)
  if (existsSync(dir)) {
    return NextResponse.json({ error: 'すでに存在します' }, { status: 409 })
  }

  try {
    mkdirSync(join(dir, 'routes', 'components'), { recursive: true })
    mkdirSync(join(dir, 'routes', 'server'),     { recursive: true })
    mkdirSync(join(dir, 'db'),                   { recursive: true })

    const tablePrefix = id.replace(/-/g, '_')
    const manifest = {
      $schema: 'https://appharbor.app/cartridge-schema-v1.json',
      spec_version: '1',
      id,
      version: '0.1.0',
      name: body.name?.trim() || id,
      description: body.description?.trim() || '新規カートリッジ',
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
      tablePrefix,
      tables: [],
      depends: [], emits: [], subscribes: [],
    }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

    writeFileSync(join(dir, 'routes', 'page.tsx'),
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
      <h1 style={{ fontSize: 28 }}>${manifest.name}</h1>
      <p style={{ color: '#94a3b8' }}>こんにちは、{ctx.actor.actorName} さん（role: {ctx.role}）</p>
    </main>
  )
}
`, 'utf-8')

    writeFileSync(join(dir, 'db', 'schema.sql'),
`-- ${id} スキーマ
-- Studio 起動時に自動適用される
-- 規約: 全テーブルに organization_id を含めること / RLS を必ず有効化

-- create table if not exists ${tablePrefix}_items (
--   id              uuid primary key default gen_random_uuid(),
--   organization_id uuid not null references organizations(id) on delete cascade,
--   created_at      timestamptz not null default now()
-- );
`, 'utf-8')

    // CLAUDE.md（Claude Code 向け指示）
    const claudeMd = renderCartridgeClaudeMd({
      id,
      name: manifest.name,
      tablePrefix,
      permissionsList: manifest.permissions.map((p) => `- ${p.id}${p.default ? ' (default)' : ''} — ${p.label ?? ''}`).join('\n'),
    })
    if (claudeMd) {
      writeFileSync(join(dir, 'CLAUDE.md'), claudeMd, 'utf-8')
    }

    // Studio 内のルーティングに即反映するため mount を実行
    try {
      spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'mount-cartridges.js')], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      })
    } catch { /* マウント失敗してもカートリッジ自体は作成済み */ }

    return NextResponse.json({ ok: true, id, path: dir })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
