'use client'

import { useEffect, useState } from 'react'
import { Bot, ChevronDown, ChevronUp, Check, Copy } from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AiContext = {
  sdk: {
    version:      string
    types:        string | null
    index:        string | null
    client:       string | null
    readme:       string | null
    /** SDK リポの prompts/cartridge-author.md (規約・鉄則の散文) */
    authorPrompt: string | null
  }
  cartridge: {
    id:       string
    claudeMd: string | null
    manifest: unknown
  }
}

type Section = 'overview' | 'sdk-types' | 'sdk-functions' | 'author-rules' | 'cartridge-rules'

const SECTIONS: { key: Section; label: string; hint: string }[] = [
  { key: 'overview',        label: 'プラットフォーム概要 + 使い方', hint: 'SDK README (公開 API と例)' },
  { key: 'sdk-types',       label: 'SDK 型定義',                  hint: 'types.ts (Actor, AppContext 等)' },
  { key: 'sdk-functions',   label: 'SDK 関数シグネチャ',          hint: 'index.ts + client.ts (requireApp 等)' },
  { key: 'author-rules',    label: 'カートリッジ作者の規約',      hint: 'SDK 同梱 prompts/cartridge-author.md' },
  { key: 'cartridge-rules', label: 'このカートリッジ固有の指示',  hint: 'cartridges/<id>/CLAUDE.md' },
]

const DEFAULT_SELECTED: Set<Section> = new Set([
  'overview', 'sdk-types', 'sdk-functions', 'author-rules', 'cartridge-rules',
])

/**
 * AI (Claude Code 等) に渡すコンテキストを組み立てるパネル。
 *
 * - チェックを ON/OFF してセクションを選ぶ
 * - 📋 でクリップボードに 1 つの巨大プロンプトとしてコピー
 * - プレビュー表示も可能 (折りたたみ)
 *
 * Tailwind + shadcn ベース。light / dark テーマ両対応。
 */
export function AiContextPanel({ appId }: { appId: string }) {
  const [ctx,      setCtx]      = useState<AiContext | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<Section>>(DEFAULT_SELECTED)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [copied,   setCopied]   = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/ai-context`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error ?? `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((j: AiContext) => { if (!cancelled) setCtx(j) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [appId])

  const toggle = (key: Section) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const buildPrompt = (): string => {
    if (!ctx) return ''
    const parts: string[] = []

    parts.push('# AppHarbor カートリッジ開発 — AI 向けコンテキスト\n')
    parts.push(`このプロンプトは Studio が組み立てた背景情報です。`)
    parts.push(`このリポジトリのコードを書く前に、以下の規約と SDK 仕様を理解してください。`)
    parts.push(`使用 SDK: \`@appharbor/sdk@${ctx.sdk.version}\`\n`)

    if (selected.has('overview') && ctx.sdk.readme) {
      parts.push('---\n')
      parts.push('## 1. プラットフォーム概要 + 使い方\n')
      parts.push(ctx.sdk.readme)
      parts.push('')
    }

    if (selected.has('sdk-types') && ctx.sdk.types) {
      parts.push('---\n')
      parts.push('## 2. SDK 型定義 (`@appharbor/sdk/types`)\n')
      parts.push('```typescript')
      parts.push(ctx.sdk.types.trim())
      parts.push('```\n')
    }

    if (selected.has('sdk-functions') && (ctx.sdk.index || ctx.sdk.client)) {
      parts.push('---\n')
      parts.push('## 3. SDK 関数シグネチャ\n')
      if (ctx.sdk.index) {
        parts.push('### サーバーサイド (`@appharbor/sdk`)')
        parts.push('```typescript')
        parts.push(ctx.sdk.index.trim())
        parts.push('```\n')
      }
      if (ctx.sdk.client) {
        parts.push('### ブラウザサイド (`@appharbor/sdk/client`)')
        parts.push('```typescript')
        parts.push(ctx.sdk.client.trim())
        parts.push('```\n')
      }
    }

    if (selected.has('author-rules') && ctx.sdk.authorPrompt) {
      parts.push('---\n')
      parts.push('## 4. カートリッジ作者の規約 (SDK 同梱)\n')
      parts.push(ctx.sdk.authorPrompt)
      parts.push('')
    }

    if (selected.has('cartridge-rules') && ctx.cartridge.claudeMd) {
      parts.push('---\n')
      parts.push(`## 5. このカートリッジ (\`${ctx.cartridge.id}\`) 固有の指示\n`)
      parts.push(ctx.cartridge.claudeMd)
      parts.push('')
    }

    return parts.join('\n')
  }

  const handleCopy = async () => {
    const text = buildPrompt()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('クリップボードへのコピーに失敗しました。')
    }
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-destructive" />
            AI 開発コンテキスト
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive">
          コンテキストを取得できませんでした: {error}
        </CardContent>
      </Card>
    )
  }

  if (!ctx) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-muted-foreground" />
            AI 開発コンテキスト
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">読み込み中...</CardContent>
      </Card>
    )
  }

  const promptLength = buildPrompt().length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4" />
          AI 開発コンテキスト
        </CardTitle>
        <CardDescription>
          Claude Code に貼り付けて使う「カートリッジ開発の前提知識」を生成します。
          SDK <code className="rounded bg-muted px-1.5 py-0.5 text-xs">@appharbor/sdk@{ctx.sdk.version}</code> の契約とこのカートリッジ固有の指示が含まれます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="space-y-2">
          {SECTIONS.map((s) => {
            const checked = selected.has(s.key)
            const available =
              (s.key === 'overview' && !!ctx.sdk.readme)
              || (s.key === 'sdk-types' && !!ctx.sdk.types)
              || (s.key === 'sdk-functions' && !!(ctx.sdk.index || ctx.sdk.client))
              || (s.key === 'author-rules' && !!ctx.sdk.authorPrompt)
              || (s.key === 'cartridge-rules' && !!ctx.cartridge.claudeMd)

            return (
              <label
                key={s.key}
                className={cn(
                  'flex items-start gap-2 text-sm',
                  available ? 'cursor-pointer text-foreground' : 'cursor-not-allowed text-muted-foreground opacity-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked && available}
                  disabled={!available}
                  onChange={() => toggle(s.key)}
                  className="mt-1 h-3.5 w-3.5 shrink-0"
                />
                <span>
                  <strong className="font-medium">{s.label}</strong>
                  <span className="ml-2 text-xs text-muted-foreground">
                    — {s.hint}
                    {!available && ' (ファイル無し)'}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleCopy} className="gap-1.5">
            {copied
              ? <Check className="h-4 w-4 text-emerald-500" />
              : <Copy className="h-4 w-4" />}
            {copied ? 'コピーしました' : 'クリップボードにコピー'}
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen((v) => !v)} className="gap-1.5">
            {previewOpen
              ? <><ChevronUp   className="h-4 w-4" /> プレビューを閉じる</>
              : <><ChevronDown className="h-4 w-4" /> プレビューを開く</>}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            約 {promptLength.toLocaleString()} 文字 / 推定 {Math.ceil(promptLength / 4).toLocaleString()} トークン
          </span>
        </div>

        {previewOpen && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
            {buildPrompt()}
          </pre>
        )}

      </CardContent>
    </Card>
  )
}
