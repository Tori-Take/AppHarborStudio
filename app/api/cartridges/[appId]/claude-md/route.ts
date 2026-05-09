import { NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'

/**
 * カートリッジ内に CLAUDE.md を生成（無ければ）
 *
 * GET  → 状態取得 ({ exists: boolean })
 * POST → 生成 ({ ok, path })
 */

function renderTemplate(ctx: { id: string; name: string; tablePrefix: string; permissionsList: string }): string | null {
  const tpl = join(process.cwd(), 'templates', 'CLAUDE.cartridge.md')
  if (!existsSync(tpl)) return null
  return readFileSync(tpl, 'utf-8')
    .replace(/\{\{CARTRIDGE_ID\}\}/g,     ctx.id)
    .replace(/\{\{CARTRIDGE_NAME\}\}/g,   ctx.name)
    .replace(/\{\{TABLE_PREFIX\}\}/g,     ctx.tablePrefix)
    .replace(/\{\{PERMISSIONS_LIST\}\}/g, ctx.permissionsList)
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const c = getCartridge(decodeURIComponent(appId))
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ exists: existsSync(join(c.path, 'CLAUDE.md')) })
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const c = getCartridge(decodeURIComponent(appId))
  if (!c || !c.manifest) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const claudeMdPath = join(c.path, 'CLAUDE.md')
  if (existsSync(claudeMdPath)) {
    return NextResponse.json({ ok: true, path: claudeMdPath, alreadyExists: true })
  }

  type Perm = { id: string; label?: string; default?: boolean }
  const m = c.manifest as { id?: string; name?: string; tablePrefix?: string; permissions?: Perm[] | string[] }
  const id            = m.id ?? c.id
  const name          = m.name ?? c.id
  const tablePrefix   = m.tablePrefix ?? id.replace(/-/g, '_')
  const permsRaw      = m.permissions ?? []
  const permsArray: Perm[] = Array.isArray(permsRaw) && typeof permsRaw[0] === 'string'
    ? (permsRaw as string[]).map((p) => ({ id: p }))
    : (permsRaw as Perm[])
  const permissionsList = permsArray.map((p) => `- ${p.id}${p.default ? ' (default)' : ''} — ${p.label ?? ''}`).join('\n')

  const content = renderTemplate({ id, name, tablePrefix, permissionsList })
  if (!content) {
    return NextResponse.json({ error: 'template not found' }, { status: 500 })
  }
  writeFileSync(claudeMdPath, content, 'utf-8')
  return NextResponse.json({ ok: true, path: claudeMdPath })
}
