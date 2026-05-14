'use client'

import { useEffect, useState } from 'react'
import { Bot, AlertTriangle, FolderOpen, Terminal } from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'

export function AiDevPanel({ appId, path }: { appId: string; path: string }) {
  const [hasClaudeMd, setHasClaudeMd] = useState<boolean | null>(null)
  const [generating,  setGenerating]  = useState(false)

  useEffect(() => {
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/claude-md`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => setHasClaudeMd(j?.exists ?? false))
      .catch(() => setHasClaudeMd(false))
  }, [appId])

  const generateClaudeMd = async () => {
    setGenerating(true)
    const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/claude-md`, { method: 'POST' })
    setGenerating(false)
    if (res.ok) setHasClaudeMd(true)
    else alert('CLAUDE.md の生成に失敗しました')
  }

  const openInExplorer = async () => {
    const res = await fetch('/api/fs/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error ?? 'フォルダを開けませんでした')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          AI で開発する
        </CardTitle>
        <CardDescription>
          Claude Code でこのフォルダを開いて開発を始めます。
          フォルダ内の <code className="rounded bg-muted px-1 text-xs">CLAUDE.md</code> +
          <code className="ml-1 rounded bg-muted px-1 text-xs">.appharbor/</code> で AI に文脈が伝わります。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">

        <div className="rounded-md border bg-muted/30 p-3">
          <div className="mb-1 text-xs text-muted-foreground">カートリッジパス</div>
          <code className="block break-all font-mono text-sm">{path}</code>
        </div>

        {hasClaudeMd === false && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>CLAUDE.md がありません — AI に文脈を渡せません</span>
            </div>
            <Button
              size="sm"
              onClick={generateClaudeMd}
              disabled={generating}
            >
              {generating ? '生成中...' : '生成する'}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <CopyButton text={path} label="パスをコピー" variant="default" />
          <Button variant="outline" onClick={openInExplorer} className="gap-1.5">
            <FolderOpen className="h-4 w-4" />
            エクスプローラーで開く
          </Button>
          <CopyButton
            text={`cd "${path}" && claude`}
            label="Claude Code 起動コマンド"
            variant="outline"
          />
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer select-none text-muted-foreground">
            <Terminal className="mr-1 inline h-3.5 w-3.5" />
            使い方の手順
          </summary>
          <ol className="mt-2 ml-5 list-decimal space-y-1 text-xs text-muted-foreground">
            <li>「エクスプローラーで開く」でフォルダを表示</li>
            <li>Claude Desktop アプリを起動し、このフォルダをドラッグ&ドロップ または開く</li>
            <li>または: ターミナルで「Claude Code 起動コマンド」をコピペ実行</li>
            <li>AI と対話しながらカートリッジを開発</li>
            <li>このページに戻って「ローカルプレイ」で動作確認</li>
          </ol>
        </details>

      </CardContent>
    </Card>
  )
}
