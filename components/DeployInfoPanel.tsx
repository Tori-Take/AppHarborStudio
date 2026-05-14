'use client'

import { useEffect, useState } from 'react'
import { Satellite, RefreshCw, ExternalLink, GitBranch, FileText, Rocket, CheckCircle2, AlertTriangle, Send } from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DeployReadyWatcher } from './DeployReadyWatcher'

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

type Props = { appId: string }

export function DeployInfoPanel({ appId }: Props) {
  const [info, setInfo] = useState<DeployInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [pushResult, setPushResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/deploy-info`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((j: DeployInfo) => { if (!cancelled) setInfo(j) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [appId, refreshTick])

  const handlePush = async () => {
    if (pushBusy) return
    setPushBusy(true)
    setPushResult(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: pushMessage.trim() || undefined }),
      })
      const j = await res.json()
      if (res.ok) {
        try { await fetch('/api/mount', { method: 'POST' }) } catch { /* ignore */ }
        setPushResult({ ok: true, text: `push 完了: ${j.commitHash ?? ''}（プレビューも更新済み）` })
        setPushMessage('')
        setRefreshTick((t) => t + 1)
      } else {
        setPushResult({ ok: false, text: j.error ?? `HTTP ${res.status}` })
      }
    } catch (e) {
      setPushResult({ ok: false, text: (e as Error).message })
    } finally {
      setPushBusy(false)
    }
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Satellite className="h-4 w-4" />
            デプロイ情報
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive">取得失敗: {error}</CardContent>
      </Card>
    )
  }

  if (!info) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Satellite className="h-4 w-4" />
            デプロイ情報
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">読み込み中...</CardContent>
      </Card>
    )
  }

  const hasDirty   = info.dirtyFiles.length > 0
  const hasUnpush  = info.unpushedCount > 0
  const inSync     = !hasDirty && !hasUnpush

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Satellite className="h-4 w-4" />
          デプロイ情報
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshTick((t) => t + 1)}
          className="gap-1.5"
          title="再取得"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          更新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">

        {/* 同期バッジ */}
        <div className="flex flex-wrap gap-2">
          {inSync && (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> ローカルと本番リポは同期
            </span>
          )}
          {hasDirty && (
            <span className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              <AlertTriangle className="h-3 w-3" /> 未コミット {info.dirtyFiles.length} 件
            </span>
          )}
          {hasUnpush && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" /> 未 push {info.unpushedCount} 件
            </span>
          )}
        </div>

        {/* 詳細 */}
        <div className="space-y-2">
          <Row label="ブランチ">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{info.branch}</code>
          </Row>

          {info.lastCommit ? (
            <Row label="最終 commit">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-2 text-xs">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{info.lastCommit.shortSha}</code>
                  <span className="text-muted-foreground">{info.lastCommit.date.slice(0, 19)}</span>
                  <span className="text-muted-foreground">by {info.lastCommit.author}</span>
                </div>
                <div className="text-foreground/80">{info.lastCommit.subject}</div>
              </div>
            </Row>
          ) : (
            <Row label="最終 commit">
              <span className="text-muted-foreground">まだ commit がありません（git に追加されていない可能性）</span>
            </Row>
          )}

          {hasDirty && (
            <Row label="未コミットファイル">
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-destructive">
                {info.dirtyFiles.slice(0, 5).map((f) => (
                  <li key={f}><code className="font-mono">{f}</code></li>
                ))}
                {info.dirtyFiles.length > 5 && <li>...他 {info.dirtyFiles.length - 5} 件</li>}
              </ul>
            </Row>
          )}
        </div>

        {/* push 操作 */}
        {!inSync && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              <Input
                value={pushMessage}
                onChange={(e) => setPushMessage(e.target.value)}
                placeholder={hasDirty ? `commit メッセージ（任意・空なら "feat: ${appId} 更新"）` : '未 push の commit を送信します'}
                disabled={pushBusy || !hasDirty}
                className="flex-1 min-w-[240px]"
              />
              <Button onClick={handlePush} disabled={pushBusy} className="gap-1.5">
                <Send className="h-4 w-4" />
                {pushBusy
                  ? '送信中...'
                  : hasDirty
                    ? `コミット & push (${info.dirtyFiles.length} 件)`
                    : `push (${info.unpushedCount} 件)`}
              </Button>
            </div>
            {pushResult && (
              <div className={cn(
                'rounded-md border px-3 py-2 text-xs whitespace-pre-wrap',
                pushResult.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-destructive/40 bg-destructive/10 text-destructive',
              )}>
                {pushResult.text}
              </div>
            )}
          </div>
        )}

        {/* リンク類 */}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {info.github?.folderUrl && (
            <a
              href={info.github.folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <GitBranch className="h-3.5 w-3.5" />
              GitHub で開く
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {info.github?.commitUrl && info.lastCommit && (
            <a
              href={info.github.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <FileText className="h-3.5 w-3.5" />
              commit {info.lastCommit.shortSha}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <a
            href={info.production.platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <Rocket className="h-3.5 w-3.5" />
            本番 AppHarbor で開く
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* 本番監視 */}
        {info.repoHead && (
          <div className="border-t pt-3">
            <DeployReadyWatcher
              appId={appId}
              baseUrl={info.production.baseUrl}
              localFullSha={info.repoHead}
              enabled={true}
            />
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          本番 URL は <code className="rounded bg-muted px-1">STUDIO_PRODUCTION_URL</code> 環境変数で変更可（現在: {info.production.baseUrl}）。
        </p>

      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-dashed border-border/50 pb-2 last:border-0 last:pb-0">
      <div className="min-w-[7rem] text-muted-foreground">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
