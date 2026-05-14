'use client'

import { useEffect, useState } from 'react'
import { Search, XCircle, AlertTriangle, CheckCircle2, Bot, Check, Copy } from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildAiFixPrompt, type LintIssue } from '@/lib/ai-fix-prompt'

export function LintPanel({ appId }: { appId: string }) {
  const [data, setData]     = useState<{ issues: LintIssue[]; filesScanned: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/lint`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [appId])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            規約チェック
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">規約チェック中...</CardContent>
      </Card>
    )
  }
  if (!data) return null

  const errors = data.issues.filter((i) => i.severity === 'error')
  const warns  = data.issues.filter((i) => i.severity === 'warn')

  const cardClass = errors.length > 0 ? 'border-destructive/40 bg-destructive/5'
                  : warns.length  > 0 ? 'border-amber-500/40 bg-amber-500/5'
                  :                     'border-emerald-500/40 bg-emerald-500/5'
  const titleClass = errors.length > 0 ? 'text-destructive'
                   : warns.length  > 0 ? 'text-amber-700 dark:text-amber-400'
                   :                     'text-emerald-700 dark:text-emerald-400'

  const handleCopyPrompt = async () => {
    const prompt = buildAiFixPrompt(appId, data.issues)
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      alert('クリップボードにコピーできませんでした')
    }
  }

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className={cn('flex items-center gap-2 text-base', titleClass)}>
          <Search className="h-4 w-4" />
          規約チェック
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({data.filesScanned} ファイル走査)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">

        <div className="flex flex-wrap gap-4">
          <span className={cn('inline-flex items-center gap-1.5', errors.length > 0 ? 'text-destructive' : 'text-muted-foreground')}>
            <XCircle className="h-3.5 w-3.5" />
            エラー: {errors.length}
          </span>
          <span className={cn('inline-flex items-center gap-1.5', warns.length > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            <AlertTriangle className="h-3.5 w-3.5" />
            警告: {warns.length}
          </span>
          {errors.length === 0 && warns.length === 0 && (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              規約準拠
            </span>
          )}
        </div>

        {data.issues.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" />
              AI に修正依頼:
            </span>
            <Button onClick={handleCopyPrompt} size="sm" variant="default" className="gap-1.5">
              {copied
                ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                : <Copy  className="h-3.5 w-3.5" />}
              {copied ? 'コピーしました' : '修正プロンプトをコピー'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Claude Code に貼り付けて使ってください
            </span>
          </div>
        )}

        {data.issues.length > 0 && (
          <ul className="space-y-2">
            {data.issues.map((i, idx) => (
              <li
                key={idx}
                className={cn(
                  'rounded border-l-4 px-3 py-2 text-xs',
                  i.severity === 'error'
                    ? 'border-destructive bg-destructive/5'
                    : 'border-amber-500 bg-amber-500/5',
                )}
              >
                <div className="font-mono text-foreground">
                  {i.file}:{i.line}
                </div>
                <div className="mt-1 text-muted-foreground">{i.message}</div>
                <code className="font-mono text-amber-700 dark:text-amber-500">{i.spec}</code>
              </li>
            ))}
          </ul>
        )}

      </CardContent>
    </Card>
  )
}
