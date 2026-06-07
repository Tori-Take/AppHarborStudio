import Link from 'next/link'
import { Plus, Package, Database, Code2, AlertCircle } from 'lucide-react'
import { scanCartridges } from '@/lib/cartridge-scanner'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RemountButton } from '@/components/RemountButton'

export default function Home() {
  const cartridges = scanCartridges()

  return (
    <div className="p-8">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">カートリッジ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cartridges.length} 件のカートリッジを検出しました
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RemountButton />
          <Link href="/cartridge/new" className={cn(buttonVariants({ size: 'sm' }))}>
            <Plus className="h-3.5 w-3.5" />
            新規カートリッジ
          </Link>
        </div>
      </div>

      {/* カートリッジ一覧 */}
      {cartridges.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cartridges.map((c) => (
            <Link
              key={c.id}
              href={`/cartridge/${encodeURIComponent(c.id)}`}
              className="flex flex-col rounded-lg border bg-card p-5 shadow-sm transition-colors hover:border-primary/30"
            >
              {/* ヘッダー: アイコン + ステータス */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xl">
                  {c.manifest?.icon ? String(c.manifest.icon) : <Package className="h-5 w-5" />}
                </div>
                {c.error ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    エラー
                  </span>
                ) : c.manifest?.studioCompatible === false ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Studio 非対応
                  </span>
                ) : null}
              </div>

              {/* 名前 + id */}
              <h2 className="font-semibold leading-tight">
                {(c.manifest?.name as string | undefined) ?? c.manifest?.displayName ?? c.id}
              </h2>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {c.id}
                {c.manifest?.version != null && (
                  <span className="ml-2">v{String(c.manifest.version)}</span>
                )}
              </p>

              {/* 説明 */}
              {c.manifest?.description != null && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {String(c.manifest.description)}
                </p>
              )}

              {/* 権限タグ */}
              {Array.isArray(c.manifest?.permissions) && c.manifest.permissions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {(c.manifest.permissions as Array<{ id?: string } | string>).map((p, i) => {
                    const id = typeof p === 'string' ? p : p?.id
                    if (!id) return null
                    return (
                      <span
                        key={`${id}-${i}`}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {id}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* フッター: 構成インジケータ */}
              <div className="mt-auto flex items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
                <span className={c.hasRoutes ? 'text-emerald-600' : 'opacity-40'} title="routes/">
                  <Code2 className="inline h-3.5 w-3.5" /> routes
                </span>
                <span className={c.hasDb ? 'text-emerald-600' : 'opacity-40'} title="db/schema.sql">
                  <Database className="inline h-3.5 w-3.5" /> db
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm font-medium">カートリッジがありません</p>
      <p className="mt-1 text-xs text-muted-foreground">
        右上の「新規カートリッジ」から最初のアプリを作りましょう
      </p>
      <Link href="/cartridge/new" className={cn(buttonVariants({ size: 'sm' }), 'mt-4')}>
        <Plus className="h-3.5 w-3.5" />
        新規カートリッジ
      </Link>
    </div>
  )
}

export const dynamic = 'force-dynamic'
