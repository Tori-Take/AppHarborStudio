'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PartyPopper, X, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  appId:       string
  displayName: string
}

export function JustCreatedBanner({ appId, displayName }: Props) {
  const router = useRouter()
  const sp     = useSearchParams()
  const [busy, setBusy] = useState(false)

  if (sp.get('just-created') !== '1') return null

  const handleDismiss = () => {
    router.replace(`/cartridge/${encodeURIComponent(appId)}`)
  }

  const handleRestart = async () => {
    if (busy) return
    if (!confirm(
      `「${displayName}」を削除して新規作成画面に戻りますか?\n\n` +
      '・カートリッジフォルダを削除します\n' +
      '・プレビュー用のマウントファイルも削除します\n' +
      '・PGlite のテーブルもクリアします\n\n' +
      '※ Git コミットしていない変更は失われます。',
    )) return

    setBusy(true)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/delete`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`削除に失敗しました: ${j.error ?? `HTTP ${res.status}`}`)
        setBusy(false)
        return
      }
      router.push('/cartridge/new')
    } catch (e) {
      alert(`削除に失敗しました: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-start gap-3">
        <PartyPopper className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-500" />
        <div className="flex-1">
          <h2 className="text-base font-semibold">
            {displayName} を作成しました
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            雛形フォルダと <code className="rounded bg-muted px-1 text-xs">.appharbor/</code> (SDK + 規約) を配置しました。
            下の「開発を始めましょう」から AI 開発を開始してください。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              disabled={busy}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              閉じる
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRestart}
              disabled={busy}
              className="gap-1.5"
              title="アプリ名/識別子をミスった時用 — 削除して新規作成画面に戻る"
            >
              {busy
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2  className="h-3.5 w-3.5" />}
              {busy ? '削除中...' : 'やり直す (削除して新規作成)'}
            </Button>
          </div>
          {busy && (
            <p className="mt-2 text-xs text-muted-foreground">
              フォルダを削除しています...
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
