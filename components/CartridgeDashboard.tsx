'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Settings2, Rocket,
  Play, Search, Bot, HelpCircle,
  FolderOpen, Database, AlertTriangle,
  Package, X, Lightbulb,
  Copy, Check, CheckCircle2,
} from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { cn } from '@/lib/utils'
import { buildAiFixPrompt, type LintIssue } from '@/lib/ai-fix-prompt'
import { buildQuickAiPrompt, type AiContext } from '@/lib/ai-context-prompt'

import { ResetCartridgeButton } from '@/components/ResetCartridgeButton'
import { JustCreatedBanner } from '@/components/JustCreatedBanner'
import { PipelineSection } from '@/components/PipelineSection'
import { DbSourceToggle } from '@/components/DbSourceToggle'

/* ── Types ──────────────────────────────────────────── */

type DeployInfo = {
  appId: string
  branch: string
  repoHead: string
  lastCommit: { fullSha: string; shortSha: string; date: string; author: string; subject: string } | null
  commitCount: number | null
  unpushedCount: number
  dirtyFiles: string[]
  isSiblingRepo: boolean
  hasRemote: boolean
  github: { base: string; folderUrl: string | null; commitUrl: string | null } | null
  production: { baseUrl: string; platformUrl: string }
}

type LintData = { issues: LintIssue[]; filesScanned: number }

export type CartridgeData = {
  id: string
  path: string
  displayName: string
  description: string | null
  manifest: Record<string, unknown> | null
  hasRoutes: boolean
  hasDb: boolean
  error: string | null
  schemaTables: string[]
  manifestTables: string[]
  needsDb: boolean
  tablesOutOfSync: boolean
  studioCompatible?: boolean
  studioCompatibleNote?: string
}

type LaunchMode = 'dev' | 'prod'

/* ═══════════════════════════════════════════════════════
   Main Dashboard
   ═══════════════════════════════════════════════════════ */

export function CartridgeDashboard({ cartridge: c }: { cartridge: CartridgeData }) {
  const [info, setInfo] = useState<DeployInfo | null>(null)

  useEffect(() => {
    let off = false
    const load = () => {
      fetch(`/api/cartridges/${encodeURIComponent(c.id)}/deploy-info`)
        .then(r => r.ok ? r.json() : null)
        .then(j => { if (!off && j) setInfo(j) })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 30_000)
    return () => { off = true; clearInterval(t) }
  }, [c.id])

  const isScaffold = info
    ? info.isSiblingRepo && (info.commitCount === null || info.commitCount <= 1) && !info.hasRemote
    : false

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> カートリッジ一覧に戻る
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/guide"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5 text-muted-foreground')}
          >
            <HelpCircle className="h-3.5 w-3.5" /> ガイド
          </Link>
          <Link
            href={`/cartridge/${encodeURIComponent(c.id)}/info`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <Settings2 className="h-3.5 w-3.5" /> アプリ情報
          </Link>
        </div>
      </div>

      <JustCreatedBanner appId={c.id} displayName={c.displayName} />

      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold">{c.displayName}</h1>
        {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <ConfigBadge ok={c.hasRoutes} label="routes/" />
          <ConfigBadge ok={c.hasDb} label="db/" />
          <ConfigBadge ok={!!c.manifest} label="manifest.json" />
        </div>
      </header>

      {/* Onboarding (scaffold only) */}
      {isScaffold && <OnboardingGuide c={c} />}

      {/* 幹: Launch */}
      <LaunchSection c={c} />

      {/* 枝: DB Operations */}
      <DbSection c={c} />

      {/* 枝葉: Dashboard */}
      <DashboardSection c={c} info={info} />
    </div>
  )
}

function ConfigBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ok ? <Check className="h-3 w-3 text-emerald-600" /> : <span className="text-muted-foreground">○</span>}
      <code className="text-xs">{label}</code>
    </span>
  )
}

/* ═══════════════════════════════════════════════════════
   Onboarding Guide (scaffold only)
   ═══════════════════════════════════════════════════════ */

function OnboardingGuide({ c }: { c: CartridgeData }) {
  const [aiCtx, setAiCtx] = useState<AiContext | null>(null)
  const [copied, setCopied] = useState(false)
  const [step, setStep] = useState(1)
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(`onboarding-dismissed:${c.id}`) === '1'
  })

  useEffect(() => {
    fetch(`/api/cartridges/${encodeURIComponent(c.id)}/ai-context`)
      .then(r => r.ok ? r.json() : null).then(j => setAiCtx(j)).catch(() => {})
  }, [c.id])

  const copyAiContext = async () => {
    if (!aiCtx) return
    try {
      await navigator.clipboard.writeText(buildQuickAiPrompt(aiCtx))
      setCopied(true)
      setTimeout(() => { setCopied(false); setStep(2) }, 1500)
    } catch { alert('コピーに失敗しました') }
  }

  const openExplorer = () => {
    fetch('/api/fs/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: c.path }) })
    setTimeout(() => setStep(3), 500)
  }

  const dismiss = () => {
    setDismissed(true)
    localStorage.setItem(`onboarding-dismissed:${c.id}`, '1')
  }

  if (dismissed) return null

  return (
    <Card className="border-2 border-blue-500/40 bg-blue-500/5">
      <CardContent className="py-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-blue-700 dark:text-blue-400">
            開発を始めましょう
          </h3>
          <button
            onClick={dismiss}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-0 divide-y divide-border/50">
          {/* Step 1 */}
          <div className={cn('flex items-center justify-between gap-3 py-3', step > 1 && 'opacity-50')}>
            <div className="flex items-center gap-3">
              <span className={cn(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                step === 1 ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground',
              )}>
                {step > 1 ? <Check className="h-3.5 w-3.5" /> : '1'}
              </span>
              <span className="text-sm font-medium">AI 開発コンテキストをコピー</span>
            </div>
            <Button size="sm" onClick={copyAiContext} disabled={!aiCtx || step > 1} className="gap-1.5 shrink-0">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'コピー済み!' : 'コピー'}
            </Button>
          </div>

          {/* Step 2 */}
          <div className={cn('flex items-center justify-between gap-3 py-3', step < 2 && 'opacity-50', step > 2 && 'opacity-50')}>
            <div className="flex items-center gap-3">
              <span className={cn(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                step === 2 ? 'bg-blue-600 text-white' : step > 2 ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground',
              )}>
                {step > 2 ? <Check className="h-3.5 w-3.5" /> : '2'}
              </span>
              <div>
                <span className="text-sm font-medium">フォルダを開いて AI で開発</span>
                <p className="text-xs text-muted-foreground mt-0.5">Claude Code / Cursor / VS Code でコードを書く</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={openExplorer} disabled={step < 2} className="gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" /> 開く
              </Button>
              <CopyButton text={`cd "${c.path}" && claude`} label="起動コマンド" variant="ghost" size="sm" />
            </div>
          </div>

          {/* Step 3 */}
          <div className={cn('flex items-center justify-between gap-3 py-3', step < 3 && 'opacity-50')}>
            <div className="flex items-center gap-3">
              <span className={cn(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                step === 3 ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground',
              )}>3</span>
              <span className="text-sm font-medium">コードを書いたら ↓ の「Studio で起動」で動作確認</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════
   幹 — Launch Section
   ═══════════════════════════════════════════════════════ */

function LaunchSection({ c }: { c: CartridgeData }) {
  const [mode, setMode] = useState<LaunchMode>('dev')
  const [prodServerStatus, setProdServerStatus] = useState<'checking' | 'running' | 'stopped' | 'starting' | 'building'>('checking')
  const [lint, setLint] = useState<LintData | null>(null)
  const [lintCopied, setLintCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/cartridges/${encodeURIComponent(c.id)}/lint`)
      .then(r => r.ok ? r.json() : null).then(j => setLint(j)).catch(() => {})
  }, [c.id])

  useEffect(() => {
    fetch('/api/studio/prod-server')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setProdServerStatus(j.running ? 'running' : 'stopped') })
      .catch(() => setProdServerStatus('stopped'))
  }, [])

  const handleLaunch = async () => {
    if (mode === 'prod') {
      if (prodServerStatus !== 'running') {
        setProdServerStatus('building')
        try {
          await fetch('/api/studio/prod-server', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'start' }),
          })
          setProdServerStatus('starting')
          const poll = setInterval(async () => {
            const r = await fetch('/api/studio/prod-server').then(r => r.json()).catch(() => null)
            if (r?.running) {
              clearInterval(poll)
              setProdServerStatus('running')
              window.open(`http://localhost:3100/org/studio-sandbox/apps/${c.id}`, `studio-prod-${c.id}`)
            }
          }, 3000)
          setTimeout(() => clearInterval(poll), 120_000)
        } catch {
          setProdServerStatus('stopped')
        }
        return
      }
      window.open(`http://localhost:3100/org/studio-sandbox/apps/${c.id}`, `studio-prod-${c.id}`)
      return
    }

    window.open(`/org/studio-sandbox/apps/${c.id}`, `appharbor-studio-${c.id}`)
    Promise.allSettled([
      fetch('/api/mount', { method: 'POST' }),
      fetch(`/api/app-permissions/${encodeURIComponent(c.id)}/init`, { method: 'POST' }),
    ])
  }

  const copyLintFix = async () => {
    if (!lint || lint.issues.length === 0) return
    try {
      await navigator.clipboard.writeText(buildAiFixPrompt(c.id, lint.issues))
      setLintCopied(true); setTimeout(() => setLintCopied(false), 2500)
    } catch {}
  }

  const errors = lint?.issues.filter(i => i.severity === 'error') ?? []
  const warns = lint?.issues.filter(i => i.severity === 'warn') ?? []
  const hasLintIssues = errors.length > 0 || warns.length > 0

  return (
    <Card className="border-2">
      <CardContent className="py-6 space-y-4">
        {/* Mode selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">モード</span>
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setMode('dev')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                mode === 'dev' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              開発
            </button>
            <button
              onClick={() => setMode('prod')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors border-l',
                mode === 'prod' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              本番
            </button>
          </div>
          {mode === 'prod' && (
            <span className={cn(
              'text-[11px] px-1.5 py-0.5 rounded-full',
              prodServerStatus === 'running' ? 'bg-emerald-100 text-emerald-700' :
              prodServerStatus === 'building' || prodServerStatus === 'starting' ? 'bg-amber-100 text-amber-700' :
              'bg-muted text-muted-foreground',
            )}>
              {prodServerStatus === 'running' ? '稼働中' :
               prodServerStatus === 'building' ? 'ビルド中...' :
               prodServerStatus === 'starting' ? '起動中...' :
               prodServerStatus === 'checking' ? '確認中' : '停止中'}
            </span>
          )}
        </div>

        {/* Big launch button */}
        <Button
          size="lg"
          onClick={handleLaunch}
          disabled={
            !c.hasRoutes ||
            c.studioCompatible === false ||
            (mode === 'prod' && (prodServerStatus === 'building' || prodServerStatus === 'starting'))
          }
          className="w-full h-14 text-lg gap-3 bg-amber-500 text-gray-900 hover:bg-amber-400 font-bold"
        >
          <Play className="h-6 w-6" />
          {mode === 'prod'
            ? prodServerStatus === 'building' ? 'ビルド中...' : prodServerStatus === 'starting' ? '起動中...' : 'Studio で起動（本番モード）'
            : 'Studio で起動'
          }
        </Button>

        {/* Disabled reasons */}
        {!c.hasRoutes && (
          <p className="text-xs text-muted-foreground text-center">routes/ がないため起動できません</p>
        )}
        {c.studioCompatible === false && (
          <p className="text-xs text-destructive text-center">Studio 非対応カートリッジ</p>
        )}

        {/* Lint warning */}
        {hasLintIssues && (
          <div className={cn(
            'flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5',
            errors.length > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/5',
          )}>
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className={cn('h-4 w-4 shrink-0', errors.length > 0 ? 'text-destructive' : 'text-amber-600')} />
              <span className="text-sm">
                {errors.length > 0 && <span className="text-destructive font-medium">エラー {errors.length}</span>}
                {errors.length > 0 && warns.length > 0 && <span className="text-muted-foreground"> / </span>}
                {warns.length > 0 && <span className="text-amber-600 font-medium">警告 {warns.length}</span>}
                <span className="text-muted-foreground ml-2">— 本番で問題になる可能性</span>
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={copyLintFix} className="gap-1.5 shrink-0 text-xs">
              {lintCopied ? <Check className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              {lintCopied ? 'コピー済み' : 'AI に修正を依頼'}
            </Button>
          </div>
        )}
        {lint && !hasLintIssues && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 justify-center">
            <CheckCircle2 className="h-3.5 w-3.5" /> 規約チェック OK
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════
   枝 — DB Operations
   ═══════════════════════════════════════════════════════ */

function DbSection({ c }: { c: CartridgeData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Database className="h-4 w-4" /> データベース操作
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* DB Source Toggle */}
        <DbSourceToggle appId={c.id} />

        {/* Reset */}
        <div className="border-t pt-4">
          <ResetCartridgeButton appId={c.id} />
        </div>

        {/* Schema sync warning */}
        {c.tablesOutOfSync && (
          <div className="border-t pt-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="text-xs">
                <strong>schema.sql と manifest.json のテーブルが不一致</strong>
                <code className="mt-1 block rounded border bg-muted/30 p-1.5 font-mono text-[11px]">
                  &quot;tables&quot;: {JSON.stringify(c.schemaTables)}
                </code>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════
   枝葉 — Dashboard
   ═══════════════════════════════════════════════════════ */

function DashboardSection({
  c, info,
}: {
  c: CartridgeData; info: DeployInfo | null
}) {
  return (
    <div className="space-y-4">
      {/* Release Pipeline (Stage 1-5) */}
      <PipelineSection appId={c.id} />

      {/* External Services */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">外部サービス</h3>
        <div className="flex flex-wrap gap-2">
          {info?.github?.base && (
            <a
              href={info.github.folderUrl ?? info.github.base}
              target="_blank" rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 text-xs')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub
            </a>
          )}
          <a
            href="https://supabase.com/dashboard"
            target="_blank" rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 text-xs')}
          >
            <Database className="h-3.5 w-3.5" />
            Supabase
          </a>
          <a
            href="https://vercel.com/dashboard"
            target="_blank" rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 text-xs')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L24 22H0L12 1z"/></svg>
            Vercel
          </a>
          {info && (
            <a
              href={info.production.platformUrl}
              target="_blank" rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 text-xs')}
            >
              <Rocket className="h-3.5 w-3.5" />
              AppHarbor 本番
            </a>
          )}
        </div>
      </div>

      {/* Auxiliary Tools */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">ツール</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <AiContextTool appId={c.id} />
          <FeedbackPromptTool appId={c.id} />
          <ExportTool appId={c.id} />
          <FolderTool path={c.path} />
          <ManifestTool manifest={c.manifest} />
        </div>
      </div>
    </div>
  )
}

/* ── Auxiliary Tool Cards ── */

function AiContextTool({ appId }: { appId: string }) {
  const [ctx, setCtx] = useState<AiContext | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/ai-context`)
      .then(r => r.ok ? r.json() : null).then(j => setCtx(j)).catch(() => {})
  }, [appId])

  const handleCopy = async () => {
    if (!ctx) return
    try {
      await navigator.clipboard.writeText(buildQuickAiPrompt(ctx))
      setCopied(true); setTimeout(() => setCopied(false), 2500)
    } catch {}
  }

  return (
    <button
      onClick={handleCopy}
      disabled={!ctx}
      className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Bot className="h-4 w-4 text-violet-600" />}
      <span className="font-medium">{copied ? 'コピー済み' : 'AI コンテキスト'}</span>
    </button>
  )
}

function FeedbackPromptTool({ appId }: { appId: string }) {
  const [copied, setCopied] = useState(false)
  const [busy,   setBusy]   = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  const handleCopy = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/feedback-prompt`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const text = await r.text()
      await navigator.clipboard.writeText(text)
      setCopied(true); setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleCopy}
      disabled={busy}
      title="今回の開発で得た知見を SDK に反映するための「AI への振り返り依頼プロンプト」をコピーします"
      className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50"
    >
      {copied
        ? <Check className="h-4 w-4 text-emerald-600" />
        : <Lightbulb className="h-4 w-4 text-amber-600" />}
      <span className="font-medium">
        {copied ? 'コピー済み' : err ? 'エラー' : '振り返り'}
      </span>
    </button>
  )
}

function ExportTool({ appId }: { appId: string }) {
  return (
    <a
      href={`/api/cartridges/${encodeURIComponent(appId)}/export`}
      download
      title="このカートリッジを .appcart.json ファイルとして出力します。AppHarbor の「JSON で取り込み」から install できます。"
      className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs text-foreground no-underline hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <Package className="h-4 w-4" />
      <span className="font-medium">配布パッケージ</span>
    </a>
  )
}

function FolderTool({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'opening' | 'ok' | 'err'>('idle')
  const [msg,   setMsg]   = useState<string | null>(null)

  const openExplorer = async () => {
    setState('opening')
    setMsg(null)
    try {
      const r = await fetch('/api/fs/open', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ path }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
      setState('ok')
      setTimeout(() => setState('idle'), 2000)
    } catch (e) {
      setState('err')
      setMsg(e instanceof Error ? e.message : 'unknown error')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  return (
    <button
      onClick={openExplorer}
      disabled={state === 'opening'}
      title={msg ? `エラー: ${msg}\nパス: ${path}` : `エクスプローラで開く\nパス: ${path}`}
      className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50"
    >
      {state === 'ok'  ? <Check className="h-4 w-4 text-emerald-600" />
        : state === 'err' ? <AlertTriangle className="h-4 w-4 text-destructive" />
        : <FolderOpen className="h-4 w-4" />}
      <span className="font-medium">
        {state === 'ok'      ? '開きました'
          : state === 'err'  ? 'エラー'
          : state === 'opening' ? '開いています…'
          : 'フォルダを開く'}
      </span>
    </button>
  )
}

function ManifestTool({ manifest }: { manifest: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false)
  if (!manifest) return null
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs hover:bg-muted/50 transition-colors cursor-pointer w-full"
      >
        <Search className="h-4 w-4" />
        <span className="font-medium">manifest.json</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-80 max-h-64 overflow-auto rounded-lg border bg-background shadow-lg">
          <pre className="p-3 font-mono text-[11px]">{JSON.stringify(manifest, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

