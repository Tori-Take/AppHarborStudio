'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, Loader2, ArrowRight, ChevronRight, AlertCircle, X, RotateCcw, Circle, RefreshCw, Copy, Plus, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useStageStatus, type StageNum } from '@/lib/use-stage-status'
import { ReleasePanel } from '@/components/stage5/ReleasePanel'
import { deriveReleaseState } from '@/lib/release-state'
import { Stage5Details } from '@/components/stage5/Stage5Details'

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
  source?: 'pglite' | 'docker'
  target?: 'docker' | 'studio-cloud'
  error?: string
  hint?: string
  step?: string
}

type Stage4CheckItem = {
  id: string
  label: string
  ok: boolean
  detail: string
}

type Stage4CheckResult = {
  checks: Stage4CheckItem[]
  allOk: boolean
  snippet: string
  repoSlug: string | null
}

type SchemaDiffSummary = {
  newTables: string[]
  droppedTables: string[]
  newColumns: Array<{ table: string; column: string; type: string }>
  droppedColumns: Array<{ table: string; column: string }>
  changedColumns: Array<{ table: string; column: string; beforeType: string; afterType: string }>
  newPolicies: Array<{ table: string; name: string; raw: string }>
  droppedPolicies: Array<{ table: string; name: string; raw: string }>
  changedPolicies: Array<{ table: string; name: string; beforeRaw: string; afterRaw: string }>
  isEmpty: boolean
}

type DestructiveWarning = {
  severity: 'high' | 'medium' | 'low'
  category: 'drop_table' | 'drop_column' | 'change_type' | 'add_not_null' | 'drop_policy'
  table: string
  column?: string
  policy?: string
  message: string
}

type Stage5PrepareResult = {
  checks: Stage4CheckItem[]
  allOk: boolean
  mode: 'initial' | 'update'
  productionMigration: string
  registryEntry: string
  repoSlug: string | null
  cartridgeId: string
  version: string
  diff: SchemaDiffSummary | null
  warnings: DestructiveWarning[]
  manualChangesNeeded: Array<{ table: string; column: string; reason: string }>
  schemaReleasedSnapshot: string
}

type CheckUpdatesResult = {
  gitAvailable: boolean
  hasChanges: boolean
  head: string | null
  headShort: string | null
  branch: string | null
  baseCommit: string | null
  baseCommitShort: string | null
  newCommits: Array<{ shortHash: string; hash: string; message: string; author: string; date: string }>
  changedFiles: Array<{
    file: string
    classification: {
      affectedStages: StageNum[]
      description: string
      category: 'code' | 'schema' | 'data' | 'meta' | 'docs' | 'released' | 'other'
    }
  }>
  dirtyFiles: string[]
  rollbackTo: StageNum | null
  affectedStages: StageNum[]
  needsReVerification: boolean
}

type AppHarborStatus = {
  pinnedRef?: string
  pinnedCommit?: string
  cartHead?: string
  cartBranch?: string
  cartridgeRepo?: string
  isNewer: boolean
  isPinnedTag?: boolean
  changeKind?: 'schema' | 'code' | 'none'
  aheadBy?: number
  changedFiles?: string[]
  hasSchemaReleased?: boolean
  manifestVersion?: string | null
  pinnedVersion?: string | null
  pinnedCommitDate?: string | null
  cartHeadDate?: string | null
  notRegistered?: boolean
  openPr?: { url: string; number: number } | null
  message?: string
  error?: string
}

export function PipelineSection({ appId }: { appId: string }) {
  const { stages, naStages, currentStage, markCompleted, markError, rollbackTo } = useStageStatus(appId)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MigrationResult | null>(null)
  const [stage4, setStage4] = useState<Stage4CheckResult | null>(null)
  const [stage4Loading, setStage4Loading] = useState(false)
  const [stage4ActionBusy, setStage4ActionBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [stage5, setStage5] = useState<Stage5PrepareResult | null>(null)
  const [stage5Loading, setStage5Loading] = useState(false)
  const [stage5Copied, setStage5Copied] = useState<'migration' | 'registry' | 'snapshot' | null>(null)
  const [installBusy, setInstallBusy] = useState(false)
  const [installResult, setInstallResult] = useState<{ ok: boolean; prUrl?: string; prNumber?: number; branch?: string; filesAdded?: number; mode?: 'registry' | 'files' | 'migration-only'; installMode?: 'initial' | 'update'; schemaVersion?: number; error?: string } | null>(null)
  const [typeCheckBusy, setTypeCheckBusy] = useState(false)
  const [typeCheckResult, setTypeCheckResult] = useState<{ ok: boolean; errors?: Array<{ file: string; line: number; col: number; code: string; message: string }>; duration?: number; error?: string } | null>(null)
  const [updates, setUpdates] = useState<CheckUpdatesResult | null>(null)
  const [updatesLoading, setUpdatesLoading] = useState(false)
  const [updatesExpanded, setUpdatesExpanded] = useState(true)
  const [ahStatus, setAhStatus] = useState<AppHarborStatus | null>(null)
  const [ahStatusLoading, setAhStatusLoading] = useState(false)
  const [bumpBusy, setBumpBusy] = useState(false)
  const [bumpResult, setBumpResult] = useState<{ ok: boolean; prUrl?: string; prNumber?: number; newTag?: string; error?: string } | null>(null)

  const fetchStage4 = useCallback(async () => {
    setStage4Loading(true)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/stage4-check`)
      if (res.ok) {
        const j = await res.json() as Stage4CheckResult
        setStage4(j)
        if (j.allOk) markCompleted(4)
      }
    } catch { /* ignore */ }
    finally { setStage4Loading(false) }
  }, [appId, markCompleted])

  const fetchStage5 = useCallback(async () => {
    setStage5Loading(true)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/stage5-prepare`)
      if (res.ok) {
        const j = await res.json() as Stage5PrepareResult
        setStage5(j)
      }
    } catch { /* ignore */ }
    finally { setStage5Loading(false) }
  }, [appId])

  useEffect(() => {
    if (currentStage === 4) fetchStage4()
  }, [currentStage, fetchStage4])

  useEffect(() => {
    if (currentStage === 5) fetchStage5()
  }, [currentStage, fetchStage5])

  const fetchAppHarborStatus = useCallback(async () => {
    setAhStatusLoading(true)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/appharbor-status`)
      if (res.ok) {
        const j = await res.json() as AppHarborStatus
        setAhStatus(j)
      }
    } catch { /* ignore */ }
    finally { setAhStatusLoading(false) }
  }, [appId])

  useEffect(() => {
    if (currentStage === 5) fetchAppHarborStatus()
  }, [currentStage, fetchAppHarborStatus])

  /**
   * Stage 5 完了後に「カートリッジリポに変更がないか」をチェックする。
   * stages[5].verifiedCommit と現在の HEAD を比較して、差分があれば banner を出す。
   */
  const fetchUpdates = useCallback(async () => {
    setUpdatesLoading(true)
    try {
      const verifiedByStage: Record<number, string | null> = {
        1: stages[1].verifiedCommit,
        2: stages[2].verifiedCommit,
        3: stages[3].verifiedCommit,
        4: stages[4].verifiedCommit,
        5: stages[5].verifiedCommit,
      }
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/check-updates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verifiedByStage }),
      })
      if (res.ok) {
        const j = await res.json() as CheckUpdatesResult
        setUpdates(j)
      }
    } catch { /* ignore */ }
    finally { setUpdatesLoading(false) }
  }, [appId, stages])

  // Stage 4 完了状態に入ったら自動で 1 回チェック
  useEffect(() => {
    if (stages[4].completed) {
      fetchUpdates()
    } else {
      setUpdates(null)
    }
  }, [stages, fetchUpdates])

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

  const handleAddToRegistry = async () => {
    if (stage4ActionBusy) return
    setStage4ActionBusy(true)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/stage4-check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await res.json()
      if (j.ok) {
        await fetchStage4()
      } else {
        markError(4, j.error ?? 'registry 登録失敗')
      }
    } catch (e) {
      markError(4, (e as Error).message)
    } finally {
      setStage4ActionBusy(false)
    }
  }

  const handleTypeCheck = async () => {
    if (typeCheckBusy) return
    setTypeCheckBusy(true)
    setTypeCheckResult(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/type-check`, { method: 'POST' })
      const j = await res.json()
      setTypeCheckResult(j)
    } catch (e) {
      setTypeCheckResult({ ok: false, error: (e as Error).message })
    } finally {
      setTypeCheckBusy(false)
    }
  }

  const handleInstallToAppHarbor = async () => {
    if (installBusy) return
    const isUpdate = stage5?.mode === 'update'
    const confirmMsg = isUpdate
      ? '更新モード: AppHarbor 本番リポに schema 更新 PR を作成します。\n\nマージ後、本番 Supabase に migration を適用してください。' +
        (stage5?.warnings && stage5.warnings.length > 0
          ? `\n\n⚠️ 破壊的変更が ${stage5.warnings.length} 件検出されています。本当に進めますか?`
          : '')
      : 'AppHarbor 本番リポに install PR を作成します。よろしいですか?\n\n(マージ後、本番 Supabase に migration を適用する必要があります)'
    if (!confirm(confirmMsg)) return
    setInstallBusy(true)
    setInstallResult(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/install-to-appharbor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await res.json()
      setInstallResult(j)
    } catch (e) {
      setInstallResult({ ok: false, error: (e as Error).message })
    } finally {
      setInstallBusy(false)
    }
  }

  const handleBumpRef = async () => {
    if (bumpBusy || !ahStatus) return
    const changeKind = ahStatus.changeKind ?? 'code'

    if (changeKind === 'schema' && !ahStatus.hasSchemaReleased) {
      alert('db/schema.released.sql が未整備です。カートリッジリポに現在の schema.sql をコピーして schema.released.sql として commit してください。')
      return
    }

    let confirmMsg = `AppHarbor の ${ahStatus.pinnedRef} → cart main (${ahStatus.aheadBy != null && ahStatus.aheadBy >= 0 ? `${ahStatus.aheadBy} commits ahead` : 'ahead'}) に更新 PR を作成します。`
    if (changeKind === 'schema') {
      confirmMsg += '\n\n⚠️ スキーマ変更を検出しました。migration SQL も同梱されます。'
    }
    confirmMsg += '\n\nタグを自動作成し、AppHarbor に PR を送信します。よろしいですか？'
    if (!confirm(confirmMsg)) return

    setBumpBusy(true)
    setBumpResult(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/install-to-appharbor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bumpRef: true, changeKind }),
      })
      const j = await res.json()
      setBumpResult(j)
      if (j.ok) {
        // 成功 → status を再取得 (isNewer が false になるはず)
        fetchAppHarborStatus()
      }
    } catch (e) {
      setBumpResult({ ok: false, error: (e as Error).message })
    } finally {
      setBumpBusy(false)
    }
  }

  const handleRelease = () => {
    const st = deriveReleaseState(ahStatus, ahStatusLoading)
    if (st.kind === 'behind') {
      handleBumpRef()
    } else if (st.kind === 'not-registered') {
      handleInstallToAppHarbor()
    }
  }

  const handleCopySnippet = () => {
    if (!stage4?.snippet) return
    navigator.clipboard.writeText(stage4.snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRollbackFromBanner = (toStage: StageNum) => {
    const stageDef = STAGES.find(s => s.num === toStage)
    const fileCount = updates?.changedFiles.length ?? 0
    const msg =
      `カートリッジに ${fileCount} 件の変更を検出しました。\n\n` +
      `Stage ${toStage} (${stageDef?.label}) にロールバックして再検証を始めますか？\n` +
      `Stage ${toStage} 以降の完了状態がリセットされます。`
    if (!confirm(msg)) return
    rollbackTo(toStage)
    setResult(null)
    setUpdates(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">リリースパイプライン</h3>
        <span className="text-xs text-muted-foreground">
          現在地: Stage {currentStage} / 5
        </span>
      </div>

      {/* 変更検出バナー (Stage 4 完了後にカートリッジに変更があった場合) */}
      {stages[4].completed && updates?.hasChanges && (
        <div className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-900">
                カートリッジに {updates.changedFiles.length} 件の変更を検出
              </span>
              {updates.dirtyFiles.length > 0 && (
                <span className="text-[11px] text-amber-700 bg-amber-100/50 px-1.5 py-0.5 rounded">
                  未コミット {updates.dirtyFiles.length} 件含む
                </span>
              )}
            </div>
            <button
              onClick={() => setUpdatesExpanded(v => !v)}
              className="text-[11px] text-blue-700 hover:text-blue-900"
            >
              {updatesExpanded ? '閉じる' : '詳細を見る'}
            </button>
          </div>

          {updatesExpanded && (
            <>
              {/* 変更ファイル一覧 (分類付き) */}
              <div className="space-y-1">
                {updates.changedFiles.map((cf, i) => {
                  const isDirty = updates.dirtyFiles.includes(cf.file)
                  const c = cf.classification
                  const catColor =
                    c.category === 'schema' ? 'text-purple-700' :
                    c.category === 'code'   ? 'text-blue-700' :
                    c.category === 'meta'   ? 'text-emerald-700' :
                    c.category === 'data'   ? 'text-cyan-700' :
                    c.category === 'docs' || c.category === 'released' ? 'text-muted-foreground' :
                    'text-foreground'
                  return (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      {isDirty && <span title="未コミット" className="text-amber-600">●</span>}
                      <code className="font-mono">{cf.file}</code>
                      <span className={cn('font-medium', catColor)}>{c.description}</span>
                      {c.affectedStages.length > 0 && (
                        <span className="text-muted-foreground">
                          → Stage {c.affectedStages.join(', ')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 新コミット一覧 (折りたたみ) */}
              {updates.newCommits.length > 0 && (
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    新コミット {updates.newCommits.length} 件
                    {updates.baseCommitShort && (
                      <span> ({updates.baseCommitShort} → {updates.headShort})</span>
                    )}
                  </summary>
                  <ul className="mt-1 ml-4 space-y-0.5 font-mono">
                    {updates.newCommits.slice(0, 10).map(c => (
                      <li key={c.hash}>
                        <span className="text-blue-700">{c.shortHash}</span>
                        <span className="ml-2">{c.message}</span>
                        <span className="ml-2 text-muted-foreground">({c.author})</span>
                      </li>
                    ))}
                    {updates.newCommits.length > 10 && (
                      <li>... 残り {updates.newCommits.length - 10} 件</li>
                    )}
                  </ul>
                </details>
              )}

              {/* アクション: ロールバックボタン */}
              {updates.needsReVerification && updates.rollbackTo && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => handleRollbackFromBanner(updates.rollbackTo!)}
                    className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Stage {updates.rollbackTo} にロールバックして再検証
                  </Button>
                  {updates.affectedStages.length > 1 && (
                    <span className="text-[11px] text-muted-foreground">
                      影響範囲: Stage {updates.affectedStages.join(', ')}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchUpdates}
                    disabled={updatesLoading}
                    className="gap-1.5"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', updatesLoading && 'animate-spin')} />
                    再チェック
                  </Button>
                </div>
              )}

              {!updates.needsReVerification && (
                <div className="text-[11px] text-muted-foreground italic">
                  すべて再検証不要な変更 (ドキュメント等)。push するだけで OK。
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Pipeline */}
      <div className="relative">
        <div className="grid grid-cols-5 gap-2">
          {STAGES.map((stage, idx) => {
            // Stage 5 はリリース状態を唯一の真実として点灯させる
            const releaseSt = stage.num === 5 ? deriveReleaseState(ahStatus, ahStatusLoading) : null
            const stage5Done = releaseSt?.kind === 'up-to-date'
            const stage5Pending = releaseSt?.kind === 'pr-pending'
            const stage5Attention = releaseSt?.kind === 'behind' || releaseSt?.kind === 'not-registered'

            const isCompleted = stages[stage.num].completed || stage5Done
            const isNa = naStages.has(stage.num)
            const isPassedNa = isCompleted && isNa // 完了済み + この環境では非対応 (ローカル開発で通過済み)
            // Stage 5: 反映待ち/要対応のときは「現在地」として目立たせる
            const isCurrent = (currentStage === stage.num && !isCompleted && !isNa) || stage5Attention || stage5Pending
            const hasError = !!stages[stage.num].lastError
            // Stage 5 の amber 強調は「要対応」状態のみ（pr-pending は neutral 寄り）
            const stageAttention = stage5Attention
            const stagePending = stage5Pending && !stage5Attention

            return (
              <div key={stage.num} className="relative">
                {/* Connector line */}
                {idx < STAGES.length - 1 && (
                  <div className={cn(
                    'absolute top-4 left-[calc(50%+1rem)] right-[calc(-50%+1rem)] h-0.5 z-0',
                    isCompleted ? (isPassedNa ? 'bg-muted-foreground/30' : 'bg-emerald-500') : 'bg-muted',
                  )} />
                )}

                <div className={cn(
                  'group relative z-10 rounded-lg border-2 p-2.5 text-center transition-colors',
                  isPassedNa && 'border-border bg-muted/30 opacity-60',
                  isCompleted && !isPassedNa && 'border-emerald-500 bg-emerald-500/5',
                  isCurrent && !hasError && !stagePending && 'border-amber-500 bg-amber-500/5',
                  isCurrent && !hasError && stagePending && 'border-blue-500/40 bg-blue-500/5',
                  isCurrent && hasError && 'border-destructive bg-destructive/5',
                  !isCompleted && isNa && 'border-border bg-muted/30 opacity-60',
                  !isCompleted && !isCurrent && !isNa && 'border-border bg-muted/20',
                )}
                title={isPassedNa ? 'ローカル開発で通過済み (この環境では操作不可)' : isNa ? 'この環境では使えません' : stagePending ? 'PR マージ待ち' : stageAttention ? '本番反映が必要です' : undefined}
                >
                  {/* 完了済み + Stage 2 以上 + 操作可能 (= N/A でない) で再実行ボタンを表示 */}
                  {isCompleted && stage.num >= 2 && !isPassedNa && (
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
                      isPassedNa && 'bg-muted-foreground/40 text-white',
                      isCompleted && !isPassedNa && 'bg-emerald-500 text-white',
                      isCurrent && !hasError && !stagePending && 'bg-amber-500 text-white',
                      isCurrent && !hasError && stagePending && 'bg-blue-500 text-white',
                      isCurrent && hasError && 'bg-destructive text-white',
                      !isCompleted && isNa && 'bg-muted text-muted-foreground',
                      !isCompleted && !isCurrent && !isNa && 'bg-muted text-muted-foreground',
                    )}>
                      {isCompleted
                        ? <Check className="h-4 w-4" />
                        : stagePending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : isNa ? '—' : stage.num}
                    </span>
                  </div>
                  <div className="text-xs font-semibold">{stage.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {isPassedNa ? 'ローカル開発で通過' : isNa ? 'この環境では非対応' : stage.sublabel}
                  </div>
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
                  <SkipStageLink stage={currentStage as StageNum} onSkip={markCompleted} />
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
                  <SkipStageLink stage={currentStage as StageNum} onSkip={markCompleted} />
                </div>
              )}

              {/* Stage 4: Vercel Studio 登録 (チェックリスト) */}
              {currentStage === 4 && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    カートリッジを GitHub に push し、Studio の registry に登録します。
                    DB は Stage 3 と同じクラウド Supabase をそのまま使います。
                  </p>

                  {/* チェックリスト */}
                  {stage4Loading && !stage4 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      チェック中...
                    </div>
                  )}

                  {stage4 && (
                    <div className="space-y-1.5">
                      {stage4.checks.map(item => (
                        <div key={item.id} className="flex items-start gap-2 text-xs">
                          {item.ok
                            ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                            : <Circle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
                          <div>
                            <span className={cn('font-medium', item.ok ? 'text-emerald-700' : 'text-foreground')}>
                              {item.label}
                            </span>
                            <span className="ml-1.5 text-muted-foreground">{item.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* アクションボタン */}
                  {stage4 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* registry 未登録の場合: 追加ボタン */}
                      {!stage4.checks.find(c => c.id === 'registry')?.ok && (
                        <Button
                          size="sm"
                          onClick={handleAddToRegistry}
                          disabled={stage4ActionBusy || !stage4.checks.find(c => c.id === 'github')?.ok}
                          className="gap-1.5"
                        >
                          {stage4ActionBusy
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Plus className="h-3.5 w-3.5" />}
                          Registry に追加
                        </Button>
                      )}

                      {/* スニペットコピー */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopySnippet}
                        className="gap-1.5"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copied ? 'コピー済み' : 'エントリをコピー'}
                      </Button>

                      {/* 再チェック */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchStage4}
                        disabled={stage4Loading}
                        className="gap-1.5"
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', stage4Loading && 'animate-spin')} />
                        再チェック
                      </Button>

                      {/* 全 OK なら手動完了ボタン */}
                      {stage4.allOk && !stages[4].completed && (
                        <Button
                          size="sm"
                          onClick={() => markCompleted(4)}
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Stage 4 完了
                        </Button>
                      )}
                    </div>
                  )}

                  <SkipStageLink stage={4} onSkip={markCompleted} />

                  {/* スニペット詳細 */}
                  {stage4?.snippet && (
                    <details className="text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground">
                        registry エントリ (YAML)
                      </summary>
                      <pre className="mt-1.5 rounded border bg-muted/30 px-2 py-1.5 font-mono whitespace-pre overflow-x-auto">
                        {stage4.snippet}
                      </pre>
                    </details>
                  )}
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
                            {result.source && (
                              <span className="mr-2 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                                source: {result.source}
                              </span>
                            )}
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

      {/* 本番稼働中バナー (リリース状態が up-to-date のとき。改修フロー用に消さない) */}
      {currentStage === 5 && deriveReleaseState(ahStatus, ahStatusLoading).kind === 'up-to-date' && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Check className="h-4 w-4" />
            <span className="font-semibold">本番稼働中</span>
            <span className="text-xs text-emerald-600">
              — 改修したい場合は下のパネルから「更新 PR」を作成できます
            </span>
          </div>
        </div>
      )}

      {/* Final stage panel (完了後も改修のため表示し続ける) */}
      {currentStage === 5 && (
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
                AppHarbor 本体に統合 — 各組織がインストール可能になります。
                以下の成果物を生成し、AppHarbor リポへ PR を送ります。
              </p>

              {/* チェックリスト */}
              {stage5Loading && !stage5 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  準備状況をチェック中...
                </div>
              )}

              {stage5 && (
                <div className="mt-3 space-y-3">
                  {/* 本番反映: 状態に応じた単一パネル */}
                  <ReleasePanel
                    status={ahStatus}
                    loading={ahStatusLoading}
                    busy={bumpBusy || installBusy}
                    onRelease={handleRelease}
                    onRecheck={fetchAppHarborStatus}
                    resultNode={
                      bumpResult && (bumpResult.ok
                        ? bumpResult.prUrl && (
                          <div className="text-xs text-amber-700">
                            <a href={bumpResult.prUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900">
                              PR #{bumpResult.prNumber} を開く（tag: {bumpResult.newTag}）&rarr;
                            </a>
                          </div>
                        )
                        : <div className="text-[11px] text-destructive">{bumpResult.error}</div>)
                    }
                    details={
                      <Stage5Details
                        stage5={stage5}
                        appId={appId}
                        typeCheckBusy={typeCheckBusy}
                        typeCheckResult={typeCheckResult}
                        onTypeCheck={handleTypeCheck}
                        stage5Copied={stage5Copied}
                        setStage5Copied={setStage5Copied}
                      />
                    }
                  />

                  {/* 直近の install PR リンク（初回反映時） */}
                  {installResult?.ok && installResult.prUrl && (
                    <div className="text-xs">
                      <a
                        href={installResult.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline text-emerald-700 hover:text-emerald-900"
                      >
                        PR #{installResult.prNumber} を開く ({installResult.filesAdded} ファイル
                        {installResult.schemaVersion && `, schema v${installResult.schemaVersion}`}
                        {installResult.mode && `, mode: ${installResult.mode}`}) →
                      </a>
                    </div>
                  )}
                  {installResult && !installResult.ok && (
                    <div className="text-[11px] text-destructive">❌ {installResult.error}</div>
                  )}

                  {/* マージ後の作業（schema 変更がある場合のみ） */}
                  {((stage5.mode === 'initial' && stage5.productionMigration) ||
                    (stage5.mode === 'update' && stage5.diff && !stage5.diff.isEmpty)) && (
                    <p className="text-[11px] text-muted-foreground">
                      マージ後: 本番 Supabase に migration を適用してください（<code className="bg-muted px-1 rounded">npx supabase db push --linked</code>）。
                    </p>
                  )}

                  {/* stage5-prepare を再取得（差分・生成物の更新） */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchStage5}
                      disabled={stage5Loading}
                      className="gap-1.5"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', stage5Loading && 'animate-spin')} />
                      生成物を再取得
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SkipStageLink({ stage, onSkip }: { stage: StageNum; onSkip: (s: StageNum) => void }) {
  const stageDef = STAGES.find(s => s.num === stage)
  return (
    <button
      onClick={() => {
        if (confirm(`Stage ${stage} (${stageDef?.label}) をスキップしますか？\n\n後から戻って実行することもできます（完了バッジの 🔄 ボタン）。`)) {
          onSkip(stage)
        }
      }}
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-1"
    >
      <SkipForward className="h-3 w-3" />
      この段階をスキップ
    </button>
  )
}
