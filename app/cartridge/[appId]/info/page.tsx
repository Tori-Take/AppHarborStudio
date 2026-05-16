import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getCartridge } from '@/lib/cartridge-scanner'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DangerZone } from '@/components/DangerZone'
import { ResetOnboardingButton } from '@/components/ResetOnboardingButton'

/**
 * カートリッジの「アプリ情報」を作成時のフォーム形式で表示する読み取り専用ページ。
 * + 危険な操作 (削除) もここに置く。
 *
 * /cartridge/new (新規作成フォーム) と同じレイアウト・同じ Input コンポーネントを使い、
 * 入力欄を disabled にして「あの時こう入力したな」が一目で分かる状態にする。
 *
 * 識別子は変更不可。名前/説明は manifest.json を直接編集することで変更可能。
 * 識別子を変えたい場合は「危険な操作 → 削除」でやり直す。
 */
export default async function CartridgeInfoPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const c = getCartridge(decodeURIComponent(appId))
  if (!c) redirect('/')

  const detailHref          = `/cartridge/${encodeURIComponent(c.id)}`
  const manifestName        = (c.manifest?.name as string) ?? c.manifest?.displayName ?? c.id
  const manifestDescription = c.manifest?.description != null ? String(c.manifest.description) : ''
  const manifestVersion     = c.manifest?.version != null ? String(c.manifest.version) : ''

  return (
    <div className="p-8 max-w-2xl">

      <Link
        href={detailHref}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        詳細ページに戻る
      </Link>

      <h1 className="mb-2 text-2xl font-bold">アプリ情報</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        作成時に入力した内容です。<strong>識別子は変更できません</strong>。
        アプリ名・説明を変えたい時は <code className="rounded bg-muted px-1 text-xs">cartridges/{c.id}/manifest.json</code> を直接編集してください。
        識別子を変えたい場合は下の「危険な操作」から削除して新規作成してください。
      </p>

      <div className="space-y-6">

        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本情報</CardTitle>
            <CardDescription>
              新規作成画面 (Step 1) と同じレイアウトです。すべて読み取り専用。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-1.5">
              <Label htmlFor="info-name">アプリ名</Label>
              <Input id="info-name" value={manifestName} disabled />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="info-id">識別子</Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-muted-foreground">/org/&lt;org&gt;/apps/</span>
                <Input id="info-id" value={c.id} disabled className="font-mono" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="info-desc">説明</Label>
              <Input id="info-desc" value={manifestDescription} disabled placeholder="(未設定)" />
            </div>

            {manifestVersion && (
              <div className="space-y-1.5">
                <Label htmlFor="info-version">バージョン</Label>
                <Input id="info-version" value={`v${manifestVersion}`} disabled className="w-32 font-mono" />
              </div>
            )}

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">オンボーディング</CardTitle>
            <CardDescription>
              初回セットアップガイド「開発を始めましょう」を再度表示します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetOnboardingButton appId={c.id} />
          </CardContent>
        </Card>

        <DangerZone appId={c.id} displayName={manifestName} />

      </div>
    </div>
  )
}
