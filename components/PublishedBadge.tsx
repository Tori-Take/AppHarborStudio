'use client'

import { useEffect, useState } from 'react'
import { PartyPopper, ExternalLink, Settings, Pencil, Package, Gamepad2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MODE_KEY = (appId: string) => `appharbor_studio_mode_${appId}`

type DeployInfo = {
  appId: string
  repoHead: string
  lastCommit: { fullSha: string; shortSha: string; date: string } | null
  dirtyFiles: string[]
  unpushedCount: number
  production: { baseUrl: string; platformUrl: string }
}

/**
 * 「公開完了」バッジ。
 *
 * ローカル最終 commit と本番 git-sha をライブで比較し、
 * 一致 + 未コミット/未 push なし、の時だけ表示する。
 */
export function PublishedBadge({ appId }: { appId: string }) {
  const [info, setInfo]       = useState<DeployInfo | null>(null)
  const [prodSha, setProdSha] = useState<string | null>(null)
  const [installed, setInstalled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadDeployInfo = () => {
      fetch(`/api/cartridges/${encodeURIComponent(appId)}/deploy-info`)
        .then((r) => r.ok ? r.json() : null)
        .then((j) => { if (!cancelled && j) setInfo(j) })
        .catch(() => {})
    }
    loadDeployInfo()
    const checkInterval = setInterval(loadDeployInfo, 30000)
    return () => { cancelled = true; clearInterval(checkInterval) }
  }, [appId])

  useEffect(() => {
    if (!info) return
    let cancelled = false
    const base = info.production.baseUrl.replace(/\/$/, '')
    const fetchProd = async () => {
      try {
        const res = await fetch(`${base}/api/git-sha?_=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const j = await res.json() as { sha: string }
        if (!cancelled) setProdSha(j.sha)
      } catch { /* ignore */ }
    }
    const fetchInstalled = async () => {
      try {
        const res = await fetch(`${base}/api/apps/${encodeURIComponent(appId)}/installed?_=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const j = await res.json() as { installed: boolean }
        if (!cancelled) setInstalled(j.installed)
      } catch {
        if (!cancelled) setInstalled(null)
      }
    }
    fetchProd()
    fetchInstalled()
    const t = setInterval(() => { fetchProd(); fetchInstalled() }, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [info, appId])

  if (!info || !info.lastCommit || !prodSha) return null

  const isPublished =
    prodSha === info.repoHead &&
    info.dirtyFiles.length === 0 &&
    info.unpushedCount === 0

  if (!isPublished) return null

  const goToDevelop = () => {
    try { localStorage.setItem(MODE_KEY(appId), 'develop') } catch { /* ignore */ }
    window.location.reload()
  }

  const ago = describeAgo(new Date(info.lastCommit.date))
  const base = info.production.baseUrl.replace(/\/$/, '')

  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-3">
          <PartyPopper className="h-8 w-8 shrink-0 text-emerald-600 dark:text-emerald-500" />
          <div className="flex-1">
            <div className="font-semibold text-emerald-700 dark:text-emerald-400">
              公開完了
            </div>
            <div className="text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1 font-mono">{info.lastCommit.shortSha}</code>
              {' '}が本番で稼働中（commit: {ago}）
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {installed === false ? (
            <a
              href={`${base}/platform/apps`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
              title="本番 AppHarbor にインストール"
            >
              <Package className="h-3.5 w-3.5" />
              本番にインストール
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <a
              href={`${base}/org/platform-preview/apps/${appId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
              title="プレビュー組織でアプリ画面を開く"
            >
              <Gamepad2 className="h-3.5 w-3.5" />
              本番で動作確認
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <a
            href={info.production.platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
            title="管理画面"
          >
            <Settings className="h-3.5 w-3.5" />
            管理画面
            <ExternalLink className="h-3 w-3" />
          </a>
          <Button onClick={goToDevelop} size="sm" className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            次の修正に入る (開発モードへ)
          </Button>
        </div>

        {installed === false && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            ⓘ まだ AppHarbor 本体にインストールされていません。「本番にインストール」から登録すると動作確認ができるようになります。
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function describeAgo(d: Date): string {
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60)    return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60)    return `${min} 分前`
  const hr  = Math.floor(min / 60)
  if (hr  < 24)    return `${hr} 時間前`
  const day = Math.floor(hr / 24)
  return `${day} 日前`
}
