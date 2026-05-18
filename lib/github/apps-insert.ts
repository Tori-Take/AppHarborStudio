import type { CartridgeManifest, ManifestPermission } from '@/lib/cartridge-scanner'

/**
 * manifest.json から `apps` テーブルへの UPSERT SQL を生成する。
 *
 * PR の migration SQL に含めることで、`supabase db push` 一発で
 * スキーマ作成 + apps 行挿入が同時に行われる。
 */
export function generateAppsInsertSql(manifest: CartridgeManifest): string {
  const esc = (s: string) => s.replace(/'/g, "''")

  const appId      = manifest.id
  const name       = manifest.name ?? manifest.displayName ?? appId
  const desc       = (manifest.description as string | undefined) ?? null
  const version    = manifest.version ?? '1.0.0'
  const icon       = (manifest.icon as string | undefined) ?? null

  const rawPerms   = manifest.permissions ?? []
  const perms: ManifestPermission[] = (rawPerms as Array<string | ManifestPermission>).map(p =>
    typeof p === 'string' ? { id: p } : p,
  )
  const permIds    = perms.map(p => p.id)
  const defaultPerm =
    (manifest.defaultPermission as string | undefined) ??
    perms.find(p => p.default)?.id ??
    permIds[0] ??
    null

  const permArray = permIds.length > 0
    ? `ARRAY[${permIds.map(p => `'${esc(p)}'`).join(', ')}]::text[]`
    : `ARRAY[]::text[]`

  return [
    `-- =============================================================`,
    `-- apps テーブル登録`,
    `-- =============================================================`,
    ``,
    `INSERT INTO apps (app_id, display_name, description, version, icon, permissions, default_permission, status)`,
    `VALUES (`,
    `  '${esc(appId)}',`,
    `  '${esc(name)}',`,
    `  ${desc !== null ? `'${esc(desc)}'` : 'NULL'},`,
    `  '${esc(version)}',`,
    `  ${icon !== null ? `'${esc(icon)}'` : 'NULL'},`,
    `  ${permArray},`,
    `  ${defaultPerm !== null ? `'${esc(defaultPerm)}'` : 'NULL'},`,
    `  'active'`,
    `)`,
    `ON CONFLICT (app_id) DO UPDATE SET`,
    `  display_name       = EXCLUDED.display_name,`,
    `  description        = EXCLUDED.description,`,
    `  version            = EXCLUDED.version,`,
    `  icon               = EXCLUDED.icon,`,
    `  permissions        = EXCLUDED.permissions,`,
    `  default_permission = EXCLUDED.default_permission,`,
    `  updated_at         = now();`,
    ``,
  ].join('\n')
}
