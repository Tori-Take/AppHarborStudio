import { NextResponse } from 'next/server'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'

/**
 * カートリッジを .appcart.json バンドルとして export する。
 *
 * 形式:
 *   {
 *     spec_version: '1',
 *     manifest: { ...manifest.json },
 *     files: [{ path: 'routes/page.tsx', content: '...' }, ...]
 *   }
 *
 * routes/, db/, manifest.json を含める。node_modules や生成物は除外。
 */

const SKIP_DIRS = new Set(['node_modules', '.git', '.next'])

function collectFiles(root: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue
      const full = join(dir, name)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue
        walk(full)
      } else {
        const rel = relative(root, full).replace(/\\/g, '/')
        files.push({ path: rel, content: readFileSync(full, 'utf-8') })
      }
    }
  }
  walk(root)
  return files
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const c = getCartridge(decodeURIComponent(appId))
  if (!c || !c.manifest) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  if (!existsSync(c.path)) {
    return NextResponse.json({ error: 'cartridge path missing' }, { status: 500 })
  }

  const bundle = {
    spec_version: '1',
    manifest:     c.manifest,
    files:        collectFiles(c.path),
    exported_at:  new Date().toISOString(),
  }

  const fileName = `${c.id}.appcart.json`
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
    },
  })
}
