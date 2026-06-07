import { redirect } from 'next/navigation'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'
import { CartridgeDashboard } from '@/components/CartridgeDashboard'

function extractTablesFromSchema(cartridgePath: string): string[] {
  const schemaPath = join(cartridgePath, 'db', 'schema.sql')
  if (!existsSync(schemaPath)) return []
  const sql = readFileSync(schemaPath, 'utf-8')
  const noComments = sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"?/gi
  const names = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(noComments)) !== null) names.add(m[1])
  return [...names]
}

export default async function CartridgePage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const c = getCartridge(decodeURIComponent(appId))
  if (!c) redirect('/')

  const schemaTables = extractTablesFromSchema(c.path)
  const manifestTables = Array.isArray((c.manifest as { tables?: unknown })?.tables)
    ? ((c.manifest as { tables?: string[] }).tables ?? [])
    : []
  const needsDb = schemaTables.length > 0
  const tablesOutOfSync = needsDb && (
    schemaTables.length !== manifestTables.length ||
    schemaTables.some((t) => !manifestTables.includes(t))
  )

  return (
    <CartridgeDashboard
      cartridge={{
        id: c.id,
        path: c.path,
        displayName: (c.manifest as { displayName?: string })?.displayName ?? c.id,
        description: (c.manifest as { description?: string })?.description ?? null,
        manifest: c.manifest as Record<string, unknown> | null,
        hasRoutes: c.hasRoutes,
        hasDb: c.hasDb,
        error: c.error ?? null,
        schemaTables,
        manifestTables,
        needsDb,
        tablesOutOfSync,
        studioCompatible: (c.manifest as { studioCompatible?: boolean })?.studioCompatible,
        studioCompatibleNote: (c.manifest as { studioCompatibleNote?: string })?.studioCompatibleNote,
      }}
    />
  )
}
