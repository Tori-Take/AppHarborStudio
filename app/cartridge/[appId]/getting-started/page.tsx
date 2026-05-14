import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, FolderOpen, Bot, Play, CheckCircle2 } from 'lucide-react'
import { getCartridge } from '@/lib/cartridge-scanner'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { AiContextPanel } from '@/components/AiContextPanel'
import { cn } from '@/lib/utils'

/**
 * 新規カートリッジ作成直後の「始め方」ガイドページ。
 *
 * Step1CreateForm → submit 成功 → このページ → 「開発を始める →」 → 詳細ページ
 *
 * - カートリッジパスとコピーボタン
 * - AI コンテキストのコピー (AiContextPanel)
 * - Claude Code に渡す手順 (4 ステップ)
 * - 詳細ページへのリンク
 */
export default async function GettingStartedPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const c = getCartridge(decodeURIComponent(appId))
  if (!c) notFound()

  const displayName = c.manifest?.displayName ?? c.id
  const detailHref  = `/cartridge/${encodeURIComponent(c.id)}`

  return (
    <div className="p-8 max-w-3xl mx-auto">

      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        カートリッジ一覧に戻る
      </Link>

      {/* 完了メッセージ */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-500" />
        <div>
          <h1 className="text-lg font-semibold">
            {displayName} を作成しました
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            雛形フォルダと <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.appharbor/</code> (SDK + 規約) を配置しました。
            このページの手順で AI 開発を始められます。
          </p>
        </div>
      </div>

      {/* パス + コピー */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4" />
            カートリッジのパス
          </CardTitle>
          <CardDescription>
            Claude Code でこのフォルダを開いて開発します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <code className="flex-1 truncate font-mono text-sm">{c.path}</code>
            <CopyButton text={c.path} label="コピー" />
          </div>
        </CardContent>
      </Card>

      {/* 4 ステップガイド */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" />
            AI に開発を依頼する 4 ステップ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4 text-sm">
            <Step num={1} title="AI 開発コンテキストをコピー">
              下のパネルの「<strong>クリップボードにコピー</strong>」を押す。
              SDK 仕様 + マルチテナント規約 + このカートリッジの CLAUDE.md がまとめてコピーされます。
            </Step>
            <Step num={2} title="フォルダを Claude Code で開く">
              上のパスをコピーして、Claude Code のターミナルで
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">cd &lt;パス&gt;</code>
              → <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">claude code</code> を起動。
            </Step>
            <Step num={3} title="コンテキスト + 依頼内容を貼り付け">
              Claude Code に Step 1 でコピーしたコンテキスト + 続けて「こんなアプリを作りたい / 〇〇機能を追加して」と書いて送信。
              AI が SDK の作法を理解した状態で開発を始めます。
            </Step>
            <Step num={4} title="ローカルプレイで動作確認">
              「開発を始める →」ボタンから詳細ページへ。develop モードの「ローカルプレイ」で起動してブラウザで確認できます。
            </Step>
          </ol>
        </CardContent>
      </Card>

      {/* AI コンテキストパネル本体 */}
      <div className="mb-6">
        <AiContextPanel appId={c.id} />
      </div>

      {/* 「開発を始める →」 */}
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <Play className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">準備ができたら詳細ページへ</span>
        </div>
        <Link href={detailHref} className={cn(buttonVariants(), 'gap-1.5')}>
          開発を始める
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

    </div>
  )
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {num}
      </span>
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="mt-1 text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}
