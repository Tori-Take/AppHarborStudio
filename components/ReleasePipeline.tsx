'use client'

import { useEffect, useState } from 'react'
import { Rocket, RefreshCw, Wrench, Clapperboard, Target, ExternalLink, ChevronRight } from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type DeployInfo = {
  appId: string
  branch: string
  repoHead: string
  lastCommit: { fullSha: string; shortSha: string; date: string; author: string; subject: string } | null
  unpushedCount: number
  dirtyFiles: string[]
  github: { base: string; folderUrl: string | null; commitUrl: string | null } | null
  production: { baseUrl: string; platformUrl: string }
}

type ProdStatus = {
  sha:       string | null
  installed: boolean | null
}

type StageStatus = 'ok' | 'warn' | 'attention' | 'unknown' | 'na'

type Stage = {
  key:    'phase1' | 'phase2' | 'phase3'
  Icon:   typeof Wrench
  title:  string
  subtitle: string
  status: StageStatus
  primary: string
  detail:  string
  action?: { label: string; href: string }
}

const STAGE_COLORS: Record<StageStatus, string> = {
  ok:        'border-emerald-500/40 bg-emerald-500/5',
  warn:      'border-amber-500/40 bg-amber-500/5',
  attention: 'border-destructive/40 bg-destructive/5',
  unknown:   'border-border bg-muted/30',
  na:        'border-border bg-muted/20',
}

const STAGE_TEXT_COLORS: Record<StageStatus, string> = {
  ok:        'text-emerald-700 dark:text-emerald-400',
  warn:      'text-amber-700 dark:text-amber-400',
  attention: 'text-destructive',
  unknown:   'text-muted-foreground',
  na:        'text-muted-foreground',
}

/**
 * カートリッジの 3 Phase 状態をパイプライン表示するコンポーネント。
 *
 * Phase 1 (ローカル) — git 作業ツリーの状態
 * Phase 2 (Studio Deploy) — main ブランチ HEAD（push 済みコード）の状態
 * Phase 3 (AppHarbor 本番) — 本番 git-sha と installed 状態
 */
export function ReleasePipeline({ appId }: { appId: string }) {
  const [info, setInfo] = useState<DeployInfo | null>(null)
  const [prod, setProd] = useState<ProdStatus>({ sha: null, installed: null })
  const [refreshTick, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`/api/cartridges/${encodeURIComponent(appId)}/deploy-info`)
        .then((r) => r.ok ? r.json() : null)
        .then((j: DeployInfo | null) => { if (!cancelled && j) setInfo(j) })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [appId, refreshTick])

  useEffect(() => {
    if (!info) return
    let cancelled = false
    const base = info.production.baseUrl.replace(/\/$/, '')
    const fetchStatus = async () => {
      try {
        const [shaRes, installedRes] = await Promise.all([
          fetch(`${base}/api/git-sha?_=${Date.now()}`, { cache: 'no-store' }).catch(() => null),
          fetch(`${base}/api/apps/${encodeURIComponent(appId)}/installed?_=${Date.now()}`, { cache: 'no-store' }).catch(() => null),
        ])
        const sha = shaRes && shaRes.ok ? ((await shaRes.json()) as { sha: string }).sha : null
        const ins = installedRes && installedRes.ok ? ((await installedRes.json()) as { installed: boolean }).installed : null
        if (!cancelled) setProd({ sha, installed: ins })
      } catch { /* ignore */ }
    }
    fetchStatus()
    const t = setInterval(fetchStatus, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [info, appId, refreshTick])

  if (!info) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4" />
            リリースパイプライン
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">読み込み中...</CardContent>
      </Card>
    )
  }

  const hasDirty   = info.dirtyFiles.length > 0
  const hasUnpush  = info.unpushedCount > 0
  const phase1Status: StageStatus = hasDirty ? 'warn' : hasUnpush ? 'warn' : 'ok'
  const phase1Detail = hasDirty
    ? `未コミット ${info.dirtyFiles.length} ファイル`
    : hasUnpush
    ? `未 push コミット ${info.unpushedCount} 件`
    : `branch ${info.branch} と同期済み`
  const phase1Primary = info.lastCommit?.shortSha ?? '(no commits)'

  const phase2Status: StageStatus = hasDirty ? 'attention' : hasUnpush ? 'attention' : 'ok'
  const phase2Primary = info.repoHead.slice(0, 7)
  const phase2Detail  = hasUnpush
    ? `${info.unpushedCount} コミット未反映`
    : 'main HEAD に同期'

  let phase3Status: StageStatus = 'unknown'
  let phase3Primary = '取得中'
  let phase3Detail  = '本番情報を取得しています'
  if (prod.sha !== null) {
    phase3Primary = prod.sha.slice(0, 7)
    if (prod.installed === false) {
      phase3Status = 'na'
      phase3Detail = '本番に未インストール'
    } else if (prod.sha === info.repoHead) {
      phase3Status = 'ok'
      phase3Detail = '最新が本番で稼働中'
    } else {
      phase3Status = 'warn'
      phase3Detail = '本番が古いバージョン'
    }
  }

  const stages: Stage[] = [
    {
      key: 'phase1', Icon: Wrench,
      title: 'Phase 1', subtitle: 'ローカル',
      status: phase1Status, primary: phase1Primary, detail: phase1Detail,
    },
    {
      key: 'phase2', Icon: Clapperboard,
      title: 'Phase 2', subtitle: 'Studio Deploy',
      status: phase2Status, primary: phase2Primary, detail: phase2Detail,
      action: info.github?.commitUrl ? { label: 'GitHub で開く', href: info.github.commitUrl } : undefined,
    },
    {
      key: 'phase3', Icon: Rocket,
      title: 'Phase 3', subtitle: 'AppHarbor 本番',
      status: phase3Status, primary: phase3Primary, detail: phase3Detail,
      action: { label: '本番を開く', href: info.production.platformUrl },
    },
  ]

  // 「次に注目すべき Phase」を判定 (Action Center と同じロジック)
  let currentPhase: Stage['key'] | null = null
  if (hasDirty || hasUnpush) {
    currentPhase = 'phase1'              // 未コミット/未 push → ローカル作業
  } else if (phase3Status === 'na' || phase3Status === 'warn') {
    currentPhase = 'phase3'              // 本番未インストール or 古い → リリース
  }
  // すべて同期済み (ok) なら currentPhase = null (現在地表示なし)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4" />
          リリースパイプライン
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefresh((t) => t + 1)}
          className="gap-1.5"
          title="再取得"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          更新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">

        <div className="grid grid-cols-3 gap-2 pt-4">
          {stages.map((s, i) => {
            const isCurrent = currentPhase === s.key
            return (
            <div
              key={s.key}
              className={cn(
                'relative rounded-lg border p-3 transition-all',
                STAGE_COLORS[s.status],
                isCurrent && 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md',
                !isCurrent && currentPhase !== null && 'opacity-60',
              )}
            >
              {isCurrent && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm whitespace-nowrap">
                  👈 ここ (次のアクション)
                </div>
              )}

              {i < stages.length - 1 && (
                <ChevronRight className="absolute -right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              )}

              <div className="mb-2 flex items-center gap-1.5">
                <s.Icon className={cn('h-3.5 w-3.5', STAGE_TEXT_COLORS[s.status])} />
                <span className={cn('text-xs font-semibold tracking-wide', STAGE_TEXT_COLORS[s.status])}>
                  {s.title}
                </span>
                <span className="text-[10px] text-muted-foreground">{s.subtitle}</span>
              </div>

              <div className="mb-1 font-mono text-sm font-semibold">
                {s.primary}
              </div>

              <div className={cn('mb-2 text-xs leading-relaxed', STAGE_TEXT_COLORS[s.status])}>
                {s.detail}
              </div>

              {s.action && (
                <a
                  href={s.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                >
                  {s.action.label}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
            )
          })}
        </div>

        <ActionCenter
          hasDirty={hasDirty}
          hasUnpush={hasUnpush}
          unpushedCount={info.unpushedCount}
          dirtyCount={info.dirtyFiles.length}
          phase3Status={phase3Status}
        />

      </CardContent>
    </Card>
  )
}

function ActionCenter({
  hasDirty,
  hasUnpush,
  unpushedCount,
  dirtyCount,
  phase3Status,
}: {
  hasDirty: boolean
  hasUnpush: boolean
  unpushedCount: number
  dirtyCount: number
  phase3Status: StageStatus
}) {
  let title: string
  let body:  string
  let tone:  'info' | 'warn' | 'ok' = 'info'

  if (hasDirty) {
    tone  = 'warn'
    title = `${dirtyCount} ファイルの未コミット変更があります`
    body  = '動作確認後、コミットして push すると Phase 2 (Studio Deploy) に反映されます。'
  } else if (hasUnpush) {
    tone  = 'warn'
    title = `未 push のコミットが ${unpushedCount} 件あります`
    body  = 'push すると Phase 2 (Studio Deploy) に反映されます。'
  } else if (phase3Status === 'na') {
    tone  = 'info'
    title = '本番にインストールされていません'
    body  = 'AppHarbor 管理者が「アプリをインストール」する必要があります。'
  } else if (phase3Status === 'warn') {
    tone  = 'info'
    title = 'Phase 3 (本番) が古いバージョンです'
    body  = 'AppHarbor 管理者が `npm run cartridge:release` で新バージョンを本番反映できます。'
  } else if (phase3Status === 'ok') {
    tone  = 'ok'
    title = 'Phase 1〜3 すべて同期済み'
    body  = '本番が最新コードで稼働中です。次の機能開発を始められます。'
  } else {
    title = 'ローカルは clean'
    body  = '本番状態を取得中...'
  }

  const toneClass = tone === 'ok'   ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                  : tone === 'warn' ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
                  :                   'border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-400'

  return (
    <div className={cn('rounded-md border p-3', toneClass)}>
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Target className="h-3.5 w-3.5" />
        次のアクション · {title}
      </div>
      <div className="mt-1 text-xs leading-relaxed text-foreground/80">
        {body}
      </div>
    </div>
  )
}
