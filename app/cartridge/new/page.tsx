import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Step1CreateForm } from '@/components/Step1CreateForm'

/**
 * 新規カートリッジ作成ページ。
 *
 * フォーム送信が成功すると /cartridge/<id> へ遷移し、開発モードへ。
 * Studio はモノクロ寄りだが、フォーム系画面は AppHarbor と同じ
 * shadcn + Tailwind ベースのデザインに揃える (フォーム UX 統一)。
 */
export default function NewCartridgePage() {
  return (
    <div className="p-8 max-w-2xl">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        カートリッジ一覧に戻る
      </Link>

      <h1 className="mb-2 text-2xl font-bold">新しいカートリッジを作る</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        アプリの雛形フォルダを生成します。Studio が SDK スナップショットと規約を
        <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">.appharbor/</code>
        に同梱するので、Claude Code はそのまま開発を始められます。
      </p>

      <Step1CreateForm />
    </div>
  )
}
