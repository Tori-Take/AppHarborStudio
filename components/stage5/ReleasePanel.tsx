'use client'

import { Loader2, ArrowRight, RefreshCw, Check, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { deriveReleaseState, type AppHarborStatusLike } from '@/lib/release-state'

export type AppHarborStatus = AppHarborStatusLike & {
  pinnedCommit?: string
  cartHead?: string
  manifestVersion?: string | null
  pinnedVersion?: string | null
  pinnedCommitDate?: string | null
  cartHeadDate?: string | null
  aheadBy?: number
  changedFiles?: string[]
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

type Props = {
  status: AppHarborStatus | null
  loading: boolean
  busy: boolean
  /** 主アクション。状態に応じて呼び分けは親で行う（behind/not-registered 共通の「本番に反映」） */
  onRelease: () => void
  onRecheck: () => void
  /** 詳細・手動操作（型チェック / 生成物コピー / 差分SQL）。折りたたみに入れる */
  details?: React.ReactNode
  /** 直近の結果リンク（PR 作成成功時など） */
  resultNode?: React.ReactNode
}

export function ReleasePanel({ status, loading, busy, onRelease, onRecheck, details, resultNode }: Props) {
  const st = deriveReleaseState(status, loading)

  if (st.kind === 'loading') {
    return (
      <div className="rounded border border-muted p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> AppHarbor の状態を確認中...
      </div>
    )
  }

  if (st.kind === 'error') {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-[11px] text-destructive">
        AppHarbor の状態を取得できませんでした: {st.message}
        <div className="mt-2"><RecheckButton onRecheck={onRecheck} loading={loading} /></div>
      </div>
    )
  }

  if (st.kind === 'ref-main') {
    return (
      <div className="rounded border border-muted p-3 text-[11px] text-muted-foreground">
        このカートリッジは自動反映設定です。固定バージョン運用に切り替えると本番反映を管理できます。
      </div>
    )
  }

  if (st.kind === 'up-to-date') {
    return (
      <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-emerald-700">
          <Check className="inline h-3.5 w-3.5 mr-1" />
          本番は最新です（{st.version}）
        </span>
        <RecheckButton onRecheck={onRecheck} loading={loading} />
      </div>
    )
  }

  if (st.kind === 'pr-pending') {
    return (
      <div className="rounded border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
        <div className="text-[11px] text-blue-800">
          <Clock className="inline h-3.5 w-3.5 mr-1" />
          <a href={st.prUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">
            PR #{st.prNumber} マージ待ち
          </a>
          {' '}— マージすると本番に反映されます
        </div>
        <RecheckButton onRecheck={onRecheck} loading={loading} />
      </div>
    )
  }

  if (st.kind === 'not-registered') {
    return (
      <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
        <div className="text-xs font-semibold text-amber-800">本番にまだありません</div>
        <p className="text-[11px] text-amber-700">このカートリッジを AppHarbor 本番に初めて反映します。</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onRelease} disabled={busy} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            {busy ? '作成中...' : '本番に反映する（初回 PR を作成）'}
          </Button>
          <RecheckButton onRecheck={onRecheck} loading={loading} />
        </div>
        {resultNode}
        {details && <DetailsDisclosure>{details}</DetailsDisclosure>}
      </div>
    )
  }

  // st.kind === 'behind'
  const s = status!
  return (
    <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
      <div className="text-xs font-semibold text-amber-800">
        更新あり: cart が本番より {s.aheadBy != null && s.aheadBy >= 0 ? `${s.aheadBy} commit 先行` : '先行'}
        {st.changeKind === 'schema' ? '（データ構造の変更あり）' : '（コードのみ）'}
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-[11px]">
        <div></div>
        <div className="font-medium text-amber-800">本番に出ている版</div>
        <div className="font-medium text-amber-800">このカートリッジの最新</div>

        <div className="text-amber-700/70">バージョン</div>
        <div className="font-mono text-amber-900">{s.pinnedVersion ?? '—'}</div>
        <div className="font-mono text-amber-900">{s.manifestVersion ?? '—'}</div>

        <div className="text-amber-700/70">コミット</div>
        <div className="font-mono text-amber-900">{s.pinnedCommit ? s.pinnedCommit.slice(0, 7) : '—'}</div>
        <div className="font-mono text-amber-900">{s.cartHead ? s.cartHead.slice(0, 7) : '—'}</div>

        <div className="text-amber-700/70">更新日時</div>
        <div className="font-mono text-amber-900">{fmtDate(s.pinnedCommitDate)}</div>
        <div className="font-mono text-amber-900">{fmtDate(s.cartHeadDate)}</div>
      </div>

      {s.changedFiles && s.changedFiles.length > 0 && (
        <div className="text-[11px] text-amber-700">
          <span className="text-amber-700/70">変更: </span>
          {s.changedFiles.slice(0, 4).join(', ')}
          {s.changedFiles.length > 4 && ` …(計 ${s.changedFiles.length} 件)`}
        </div>
      )}

      {st.schemaBlocked && (
        <p className="text-[11px] text-amber-700">
          データ構造の変更を含みますが、<strong>db/schema.released.sql</strong> が未整備です。先にコミットしてください。
        </p>
      )}
      {st.changeKind === 'schema' && !st.schemaBlocked && (
        <p className="text-[11px] text-amber-700">データ構造の変更を含むため migration も自動生成されます。</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={onRelease}
          disabled={busy || st.schemaBlocked}
          className="gap-1.5 bg-amber-600 hover:bg-amber-700"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          {busy ? '作成中...' : '本番に反映する（PR を作成）'}
        </Button>
        <RecheckButton onRecheck={onRecheck} loading={loading} />
      </div>

      {resultNode}
      {details && <DetailsDisclosure>{details}</DetailsDisclosure>}
    </div>
  )
}

function RecheckButton({ onRecheck, loading }: { onRecheck: () => void; loading: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onRecheck} disabled={loading} className="gap-1.5">
      <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
      再確認
    </Button>
  )
}

function DetailsDisclosure({ children }: { children: React.ReactNode }) {
  return (
    <details className="text-[11px] text-muted-foreground">
      <summary className="cursor-pointer hover:text-foreground">詳細・手動操作</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  )
}
