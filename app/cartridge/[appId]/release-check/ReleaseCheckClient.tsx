'use client'

import { useCallback, useEffect, useState } from 'react'

type CheckItem = {
  id:     string
  label:  string
  ok:     boolean
  detail: string
}

type ApiResponse = {
  checks:               CheckItem[]
  allOk:                boolean
  productionMigration:  string
  registryEntry:        string
  repoSlug:             string | null
  cartridgeId:          string
  version:              string
}

type Props = { appId: string }

export function ReleaseCheckClient({ appId }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/stage5-prepare`, { cache: 'no-store' })
      if (!r.ok) {
        setError(`API error: ${r.status}`)
        return
      }
      setData(await r.json() as ApiResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => { load() }, [load])

  if (loading) return <p className="text-sm text-muted-foreground">チェック中…</p>
  if (error)   return <p className="text-sm text-red-600">エラー: {error}</p>
  if (!data)   return null

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${data.allOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <h2 className="font-semibold">
              {data.allOk ? 'リリース可能' : '未完了の項目があります'}
            </h2>
          </div>
          <button
            onClick={load}
            className="rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          >
            🔄 再チェック
          </button>
        </header>

        <ul className="divide-y">
          {data.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                c.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {c.ok ? '✓' : '✕'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground break-words">{c.detail}</p>
                {!c.ok && <p className="mt-1 text-xs text-amber-700">{hintFor(c.id)}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="font-semibold">📋 生成物 (コピペで使える)</h2>
        </header>
        <div className="space-y-4 p-4">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              AppHarbor 本体の <code>cartridges-registry.yaml</code> に追記:
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">
{data.registryEntry}
            </pre>
          </div>

          {data.productionMigration && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                本番 Supabase 用 migration (<code>supabase/migrations/&lt;timestamp&gt;_cart_{data.cartridgeId}_v{data.version.replace(/\./g, '_')}.sql</code>):
              </p>
              <details className="rounded-md border bg-muted/30">
                <summary className="cursor-pointer px-3 py-2 text-xs">
                  クリックで展開 ({data.productionMigration.split('\n').length} 行)
                </summary>
                <pre className="overflow-x-auto p-3 text-xs">
{data.productionMigration}
                </pre>
              </details>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">📚 関連ドキュメント</p>
        <ul className="mt-2 space-y-1 list-disc pl-5">
          <li>
            <a
              href="https://github.com/Tori-Take/cartridge-template/blob/main/docs/release-checklist.md"
              target="_blank"
              rel="noopener"
              className="text-primary hover:underline"
            >
              cartridge-template/docs/release-checklist.md
            </a> — 8 ステップ手順 + よくあるハマりポイント FAQ
          </li>
          <li>
            <a
              href="https://github.com/Tori-Take/cartridge-template/blob/main/docs/pitfalls.md"
              target="_blank"
              rel="noopener"
              className="text-primary hover:underline"
            >
              cartridge-template/docs/pitfalls.md
            </a> — AI が間違えがちな 10 個の罠
          </li>
        </ul>
      </section>
    </div>
  )
}

function hintFor(id: string): string {
  switch (id) {
    case 'manifest':
      return 'manifest.json に id / name / tables / permissions を追加してください。自前テーブルが不要なら tables: [] でも OK。'
    case 'schema':
      return '自前テーブルが必要ならば db/schema.sql を作成。不要なカートリッジ (notify() だけ等) なら無視可。'
    case 'routes':
      return 'routes/page.tsx などのページファイルを置いてください。'
    case 'github':
      return 'リポジトリを GitHub に push してください: gh repo create --public --source=. --remote=origin --push'
    case 'lint':
      return '違反内容は Lint パネルまたは API レスポンスで確認。@appharbor/sdk → @/sdk の置換が必要なケースが多い。'
    case 'git-sync':
      return 'コミットして remote に push してください: git add -A && git commit -m "..." && git push'
    default:
      return ''
  }
}
