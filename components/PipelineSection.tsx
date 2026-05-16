'use client'

import { useState } from 'react'
import { Check, Loader2, ArrowRight, ChevronRight, AlertCircle, X, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useStageStatus, type StageNum } from '@/lib/use-stage-status'

type StageDef = {
  num: StageNum
  label: string
  sublabel: string
  description: string
  /** この Stage を完了するためのアクションラベル */
  actionLabel: string
}

const STAGES: StageDef[] = [
  { num: 1, label: 'PGlite',          sublabel: 'ローカル開発',       description: 'ローカル Studio で即時イテレーション',           actionLabel: '' /* auto */ },
  { num: 2, label: 'Docker Supabase', sublabel: '本物 Postgres 検証', description: '個人 PC の Docker で本物の Postgres 挙動を確認', actionLabel: 'Docker Supabase に移行' },
  { num: 3, label: 'Studio Supabase', sublabel: 'クラウド検証',       description: 'Studio 専用 Supabase でクラウド DB の挙動を確認', actionLabel: 'Studio Supabase に移行' },
  { num: 4, label: 'Vercel Studio',   sublabel: 'デプロイ検証',       description: 'Vercel にデプロイした Studio で動作確認',         actionLabel: 'Vercel Studio に登録' },
  { num: 5, label: 'AppHarbor',       sublabel: '本番稼働',           description: 'AppHarbor 本体に統合 — 各組織がインストール可能', actionLabel: 'AppHarbor 本番に統合' },
]

type TableResult = {
  table: string
  rowsRead: number
  rowsInserted: number
  error?: string
}

type SetupStep = {
  name: string
  status: 'ok' | 'warn' | 'error' | 'skipped'
  detail: string
}

type SetupResult = {
  ok: boolean
  steps: SetupStep[]
  followUps: string[]
}

type MigrationResult = {
  ok: boolean
  baseSchemaApplied?: boolean
  baseDataMigrated?: boolean
  schemaApplied?: boolean
  dataMigrated?: boolean
  tableResults?: TableResult[]
  setup?: SetupResult | null
  duration?: number
  error?: string
  hint?: string
  step?: string
}

export function PipelineSection({ appId }: { appId: string }) {
  const { stages, currentStage, markCompleted, markError, rollbackTo } = useStageStatus(appId)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MigrationResult | null>(null)

  const currentDef = STAGES.find(s => s.num === currentStage)

  const handleRollback = (stage: StageNum) => {
    if (stage < 2) return
    const stageDef = STAGES.find(s => s.num === stage)
    const msg = `Stage ${stage} (${stageDef?.label}) を再実行モードに戻します。\n\n` +
      `Stage ${stage} 以降の完了状態が解除され、移行ボタンが再度押せるようになります。\n` +
      `※ Docker / Supabase のデータ自体は消えません (再 migrate で冪等に更新)。`
    if (!confirm(msg)) return
    rollbackTo(stage)
    setResult(null)
  }

  const handleMigrateToDocker = async () => {
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/migrate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'docker' }),
      })
      const j = await res.json() as MigrationResult
      setResult(j)
      if (j.ok) {
        markCompleted(2)
      } else {
        markError(2, j.error ?? 'migration failed')
      }
    } catch (e) {
      const msg = (e as Error).message
      setResult({ ok: false, error: msg })
      markError(2, msg)
    } finally {
      setBusy(false)
    }
  }

  const handleMigrateToStudioCloud = async () => {
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/migrate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'studio-cloud' }),
      })
      const j = await res.json() as MigrationResult
      setResult(j)
      if (j.ok) {
        markCompleted(3)
      } else {
        markError(3, j.error ?? 'migration failed')
      }
    } catch (e) {
      const msg = (e as Error).message
      setResult({ ok: false, error: msg })
      markError(3, msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">リリースパイプライン</h3>
        <span className="text-xs text-muted-foreground">
          現在地: Stage {currentStage} / 5
        </span>
      </div>

      {/* Pipeline */}
      <div className="relative">
        <div className="grid grid-cols-5 gap-2">
          {STAGES.map((stage, idx) => {
            const isCompleted = stages[stage.num].completed
            const isCurrent = currentStage === stage.num && !isCompleted
            const hasError = !!stages[stage.num].lastError

            return (
              <div key={stage.num} className="relative">
                {/* Connector line */}
                {idx < STAGES.length - 1 && (
                  <div className={cn(
                    'absolute top-4 left-[calc(50%+1rem)] right-[calc(-50%+1rem)] h-0.5 z-0',
                    isCompleted ? 'bg-emerald-500' : 'bg-muted',
                  )} />
                )}

                <div className={cn(
                  'group relative z-10 rounded-lg border-2 p-2.5 text-center transition-colors',
                  isCompleted && 'border-emerald-500 bg-emerald-500/5',
                  isCurrent && !hasError && 'border-amber-500 bg-amber-500/5',
                  isCurrent && hasError && 'border-destructive bg-destructive/5',
                  !isCompleted && !isCurrent && 'border-border bg-muted/20',
                )}>
                  {/* 完了済み + Stage 2 以上で再実行ボタンを表示 */}
                  {isCompleted && stage.num >= 2 && (
                    <button
                      onClick={() => handleRollback(stage.num)}
                      className="absolute -top-2 -right-2 z-20 rounded-full bg-background border border-emerald-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-emerald-50"
                      title={`Stage ${stage.num} を再実行する`}
                    >
                      <RotateCcw className="h-3 w-3 text-emerald-700" />
                    </button>
                  )}
                  <div className="flex items-center justify-center mb-1.5">
                    <span className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                      isCompleted && 'bg-emerald-500 text-white',
                      isCurrent && !hasError && 'bg-amber-500 text-white',
                      isCurrent && hasError && 'bg-destructive text-white',
                      !isCompleted && !isCurrent && 'bg-muted text-muted-foreground',
                    )}>
                      {isCompleted ? <Check className="h-4 w-4" /> : stage.num}
                    </span>
                  </div>
                  <div className="text-xs font-semibold">{stage.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{stage.sublabel}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Current stage detail + next action */}
      {currentDef && currentStage < 5 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700">
              <ChevronRight className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">
                Stage {currentStage}: {currentDef.label}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {currentDef.description}
              </p>
              {stages[currentStage].lastError && !result && (
                <p className="mt-2 text-xs text-destructive">
                  前回エラー: {stages[currentStage].lastError}
                </p>
              )}

              {/* Stage 2 へ移行 (PGlite → Docker Supabase) */}
              {currentStage === 2 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <code className="bg-muted px-1 rounded">db/schema.sql</code> を適用後、
                    PGlite にあるデータを Docker Supabase に同期します (冪等)。
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleMigrateToDocker} disabled={busy} className="gap-1.5">
                      {busy
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <ArrowRight className="h-3.5 w-3.5" />}
                      {busy ? '適用中...' : currentDef.actionLabel}
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      事前に <code className="bg-muted px-1 rounded">supabase start</code> を実行
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    接続先: <code className="bg-muted px-1 rounded">postgresql://postgres:postgres@127.0.0.1:54322/postgres</code>
                  </p>
                </div>
              )}

              {/* Stage 3 へ移行 (Docker/PGlite → Studio Cloud Supabase) */}
              {currentStage === 3 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <code className="bg-muted px-1 rounded">db/schema.sql</code> を適用後、
                    PGlite のデータを Studio 専用クラウド Supabase に同期します (冪等)。
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleMigrateToStudioCloud} disabled={busy} className="gap-1.5">
                      {busy
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <ArrowRight className="h-3.5 w-3.5" />}
                      {busy ? '適用中...' : currentDef.actionLabel}
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      事前に <code className="bg-muted px-1 rounded">.env.local</code> に接続情報を設定
                    </span>
                  </div>
                  <details className="text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">
                      必要な環境変数を確認
                    </summary>
                    <div className="mt-1.5 rounded border bg-muted/30 px-2 py-1.5 font-mono space-y-0.5">
                      <div>STUDIO_CLOUD_SUPABASE_URL=https://xxxxx.supabase.co</div>
                      <div>STUDIO_CLOUD_SUPABASE_SERVICE_ROLE_KEY=eyJ... or sb_secret_...</div>
                      <div>STUDIO_CLOUD_SUPABASE_DB_URL=postgresql://postgres.[ref]:[pass]@...pooler.supabase.com:6543/postgres</div>
                    </div>
                  </details>
                </div>
              )}

              {/* Stage 4 (未実装) */}
              {currentStage === 4 && (
                <div className="mt-3">
                  <Button size="sm" disabled className="gap-1.5">
                    {currentDef.actionLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    (未実装 — 順次追加していきます)
                  </span>
                </div>
              )}

              {/* Migration result */}
              {result && (
                <div className={cn(
                  'mt-3 rounded-md border px-3 py-2 text-xs',
                  result.ok
                    ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700'
                    : 'border-destructive/40 bg-destructive/5 text-destructive',
                )}>
                  <div className="flex items-start gap-2">
                    {result.ok
                      ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                    <div className="flex-1">
                      {result.ok ? (
                        <>
                          <div className="font-semibold">移行成功</div>
                          <div className="mt-0.5 text-muted-foreground">
                            <span>ベース {result.baseSchemaApplied ? '✓' : '✗'}/{result.baseDataMigrated ? '✓' : '✗'}</span>
                            <span className="ml-2">カートリッジ {result.schemaApplied ? '✓' : '✗'}/{result.dataMigrated ? '✓' : '✗'}</span>
                            {result.duration && <span className="ml-2">({result.duration}ms)</span>}
                          </div>
                          {result.setup && (
                            <div className="mt-2 space-y-1">
                              <div className="text-xs font-semibold">セットアップ自動化</div>
                              {result.setup.steps.map((s, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[11px]">
                                  <span className="font-mono">
                                    {s.status === 'ok'    ? '✓' :
                                     s.status === 'warn'  ? '⚙' :
                                     s.status === 'error' ? '✗' : '⊘'}
                                  </span>
                                  <span className="font-mono">{s.name}:</span>
                                  <span className="text-muted-foreground">{s.detail}</span>
                                </div>
                              ))}
                              {result.setup.followUps.length > 0 && (
                                <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1.5">
                                  <div className="text-[11px] font-semibold text-amber-700">⚠ 残作業</div>
                                  <ul className="mt-1 space-y-0.5 text-[11px] text-amber-700">
                                    {result.setup.followUps.map((f, i) => (
                                      <li key={i}>• {f}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          {result.tableResults && result.tableResults.length > 0 && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                                テーブル別詳細 ({result.tableResults.length} テーブル)
                              </summary>
                              <table className="mt-1.5 w-full text-[11px]">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="font-normal py-1">テーブル</th>
                                    <th className="font-normal py-1 text-right">読み込み</th>
                                    <th className="font-normal py-1 text-right">挿入</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {result.tableResults.map(t => (
                                    <tr key={t.table} className="border-t border-border/30">
                                      <td className="py-0.5 font-mono">{t.table}</td>
                                      <td className="py-0.5 text-right">{t.rowsRead}</td>
                                      <td className="py-0.5 text-right">{t.rowsInserted}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </details>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="font-semibold">移行エラー</div>
                          <pre className="mt-0.5 whitespace-pre-wrap break-words text-[11px]">{result.error}</pre>
                          {result.hint && (
                            <div className="mt-1 text-muted-foreground">💡 {result.hint}</div>
                          )}
                          {result.tableResults && result.tableResults.length > 0 && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                                途中までの結果 ({result.tableResults.length} テーブル)
                              </summary>
                              <table className="mt-1.5 w-full text-[11px]">
                                <tbody>
                                  {result.tableResults.map(t => (
                                    <tr key={t.table} className="border-t border-border/30">
                                      <td className="py-0.5 font-mono">{t.table}</td>
                                      <td className="py-0.5">
                                        {t.error ? `❌ ${t.error}` : `${t.rowsInserted}/${t.rowsRead} 行`}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </details>
                          )}
                        </>
                      )}
                    </div>
                    <button onClick={() => setResult(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All stages completed */}
      {currentStage === 5 && stages[5].completed && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Check className="h-4 w-4" />
            <span className="font-semibold">全段階完了 — このカートリッジは AppHarbor 本番で稼働中です</span>
          </div>
        </div>
      )}

      {/* Final stage in progress */}
      {currentStage === 5 && !stages[5].completed && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700">
              <ChevronRight className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">
                Stage 5: AppHarbor 本番統合
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                AppHarbor 本体に統合 — 各組織がインストール可能になります
              </p>
              <div className="mt-3">
                <Button size="sm" disabled className="gap-1.5">
                  AppHarbor registry エントリを生成
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <span className="ml-2 text-[11px] text-muted-foreground">
                  (未実装 — 順次追加していきます)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
