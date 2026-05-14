import Link from 'next/link'
import { notFound } from 'next/navigation'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ArrowLeft, Database, FolderOpen, AlertTriangle, FileCheck2, Play, Settings2, Wrench, Clapperboard, Rocket } from 'lucide-react'
import { getCartridge } from '@/lib/cartridge-scanner'
import { LintPanel } from '@/components/LintPanel'
import { ExportButton } from '@/components/ExportButton'
import { AiDevPanel } from '@/components/AiDevPanel'
import { AiContextPanel } from '@/components/AiContextPanel'
import { PlayButton } from '@/components/PlayButton'
import { DeployInfoPanel } from '@/components/DeployInfoPanel'
import { ResetCartridgeButton } from '@/components/ResetCartridgeButton'
import { PublishedBadge } from '@/components/PublishedBadge'
import { ReleasePipeline } from '@/components/ReleasePipeline'
import { JustCreatedBanner } from '@/components/JustCreatedBanner'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** db/schema.sql から create table 文を抽出（コメント除外） */
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
  if (!c) notFound()

  const schemaTables    = extractTablesFromSchema(c.path)
  const manifestTables  = Array.isArray((c.manifest as { tables?: unknown })?.tables)
    ? ((c.manifest as { tables?: string[] }).tables ?? [])
    : []
  const needsDb         = schemaTables.length > 0
  const tablesOutOfSync = needsDb && (
    schemaTables.length !== manifestTables.length ||
    schemaTables.some((t) => !manifestTables.includes(t))
  )

  return (
    <div className="p-8 max-w-3xl mx-auto">

      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          カートリッジ一覧に戻る
        </Link>
        <Link
          href={`/cartridge/${encodeURIComponent(c.id)}/info`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
        >
          <Settings2 className="h-3.5 w-3.5" />
          アプリ情報・削除
        </Link>
      </div>

      <JustCreatedBanner appId={c.id} displayName={c.manifest?.displayName ?? c.id} />

      <header className="mb-6">
        <h1 className="flex items-baseline gap-3 text-2xl font-bold">
          {c.manifest?.displayName ?? c.id}
          <span className="text-sm font-normal text-muted-foreground">{c.id}</span>
        </h1>
        {c.manifest?.description && (
          <p className="mt-2 text-sm text-muted-foreground">{c.manifest.description}</p>
        )}
      </header>

      <div className="mb-6">
        <ReleasePipeline appId={c.id} />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4" />
            パス
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <code className="flex-1 truncate font-mono text-sm">{c.path}</code>
            <CopyButton text={c.path} label="コピー" />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="h-4 w-4" />
            構成
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            <ConfigRow ok={c.hasRoutes} label="routes/" />
            <ConfigRow ok={c.hasDb}     label="db/" />
            <ConfigRow ok={!!c.manifest} label="manifest.json" errorText={c.error} />
          </ul>
        </CardContent>
      </Card>

      {/* DB 接続必要バナー: schema.sql に create table がある場合 */}
      {needsDb && (
        <Card className="mb-4 border-emerald-500/40 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-400">
              <Database className="h-4 w-4" />
              このアプリは DB 接続が必要です
            </CardTitle>
            <CardDescription>
              <code className="rounded bg-muted px-1">db/schema.sql</code> に
              <strong> {schemaTables.length} 個</strong>のテーブル定義があります。
              <strong>本番デプロイ後、AppHarbor の「DB セットアップ」ダイアログから Supabase に SQL を適用してください。</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="ml-5 list-disc space-y-1 text-xs">
              {schemaTables.map((t) => {
                const declared = manifestTables.includes(t)
                return (
                  <li key={t}>
                    <code className="rounded bg-muted px-1 font-mono text-xs">{t}</code>
                    {declared
                      ? <span className="ml-2 text-emerald-600 dark:text-emerald-500">✓ manifest 宣言済み</span>
                      : <span className="ml-2 text-amber-600 dark:text-amber-500">⚠ manifest.tables に未宣言</span>
                    }
                  </li>
                )
              })}
            </ul>
            {tablesOutOfSync && (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                  <div>
                    <strong>manifest.json の <code className="rounded bg-muted px-1">tables</code> 配列を schema.sql と一致させてください。</strong>
                    <br />推奨値:
                    <code className="mt-2 block rounded border bg-muted/30 p-2 font-mono text-xs">
                      &quot;tables&quot;: {JSON.stringify(schemaTables)}
                    </code>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════ Phase 1 · ローカル開発 ═══════════ */}
      <PhaseSection
        Icon={Wrench}
        title="Phase 1 · ローカル開発"
        description="Claude Code でフォルダを開いて開発し、ローカル PGlite で動作確認します。"
        accentClass="text-blue-700 dark:text-blue-400"
      >
        <AiContextPanel appId={c.id} />
        <AiDevPanel appId={c.id} path={c.path} />

        <Card className="border-dashed bg-muted/30">
          <CardHeader>
            <CardTitle className="text-base">開発の進め方</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="ml-5 list-decimal space-y-2 text-sm">
              <li>上の「<strong>AI 開発コンテキスト</strong>」を <strong>コピー</strong></li>
              <li>「<strong>エクスプローラーで開く</strong>」でフォルダを開く</li>
              <li>そのフォルダを <strong>Claude Code</strong> で開き、コピーしたコンテキスト + やりたいことを貼り付けて依頼<br/>
                <span className="text-xs text-muted-foreground">
                  （AI が SDK 契約とこのカートリッジの規約を理解した状態で開発を始められます）
                </span>
              </li>
              <li>下の「ローカルプレイ」で動作確認</li>
            </ol>
          </CardContent>
        </Card>

        <Card className={cn(
          c.manifest?.studioCompatible === false ? 'border-destructive/40' : 'border-blue-500/40',
        )}>
          <CardHeader>
            <CardTitle className={cn(
              'flex items-center gap-2 text-base',
              c.manifest?.studioCompatible === false ? 'text-destructive' : 'text-blue-600 dark:text-blue-400',
            )}>
              <Play className="h-4 w-4" />
              ローカルプレイ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {c.manifest?.studioCompatible === false ? (
              <div>
                <div className="font-semibold text-destructive">Studio 非対応カートリッジ</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {c.manifest.studioCompatibleNote ?? 'このカートリッジは規約違反の依存があるため Studio で起動できません。'}
                </p>
              </div>
            ) : c.hasRoutes ? (
              <PlayButton appId={c.id} />
            ) : (
              <p className="text-sm text-muted-foreground">
                routes/ がないため起動できません
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              DB は PGlite ファイル永続化。リセットは <code className="rounded bg-muted px-1 text-xs">studio/.studio-db/</code> を削除。
            </p>
            <ResetCartridgeButton appId={c.id} />
          </CardContent>
        </Card>
      </PhaseSection>

      {/* ═══════════ Phase 2 · Studio Deploy ═══════════ */}
      <PhaseSection
        Icon={Clapperboard}
        title="Phase 2 · Studio Deploy"
        description="git push して GitHub 経由で Vercel に展開。クライアントレビュー用の共有 URL を確認します。"
        accentClass="text-amber-700 dark:text-amber-400"
      >
        <PublishedBadge appId={c.id} />
        <DeployInfoPanel appId={c.id} />
      </PhaseSection>

      {/* ═══════════ Phase 3 · AppHarbor 本番 ═══════════ */}
      <PhaseSection
        Icon={Rocket}
        title="Phase 3 · AppHarbor 本番"
        description="規約チェックを通過したら cartridges-registry.yaml に追加して本番反映。"
        accentClass="text-emerald-700 dark:text-emerald-400"
      >
        <LintPanel appId={c.id} />
        <ExportButton appId={c.id} />

        {c.manifest && (
          <Card>
            <CardContent className="py-4">
              <details className="text-sm">
                <summary className="cursor-pointer select-none text-muted-foreground">
                  manifest.json を表示
                </summary>
                <pre className="mt-3 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
                  {JSON.stringify(c.manifest, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        )}
      </PhaseSection>

    </div>
  )
}

function PhaseSection({
  Icon,
  title,
  description,
  accentClass,
  children,
}: {
  Icon:         React.ComponentType<{ className?: string }>
  title:        string
  description:  string
  accentClass:  string
  children:     React.ReactNode
}) {
  return (
    <section className="mt-8 border-t pt-6">
      <div className="mb-4">
        <h2 className={cn('flex items-center gap-2 text-lg font-bold', accentClass)}>
          <Icon className="h-5 w-5" />
          {title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function ConfigRow({ ok, label, errorText }: { ok: boolean; label: string; errorText?: string | null }) {
  return (
    <li className="flex items-center gap-2">
      {ok
        ? <span className="text-emerald-600 dark:text-emerald-500">✓</span>
        : <span className="text-muted-foreground">○</span>}
      <code className="font-mono text-xs">{label}</code>
      {!ok && (
        <span className="text-xs text-muted-foreground">
          {errorText ? `エラー: ${errorText}` : '無し'}
        </span>
      )}
    </li>
  )
}
