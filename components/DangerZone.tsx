'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Props = {
  appId:       string
  displayName: string
}

/**
 * カートリッジを完全削除する「危険な操作」セクション。
 *
 * GitHub 流の "Danger Zone" パターン。赤いボーダーで誤クリックを抑止し、
 * confirm ダイアログで二重確認する。
 */
export function DangerZone({ appId, displayName }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const handleDelete = async () => {
    if (busy) return
    if (!confirm(
      `「${displayName}」(${appId}) を完全に削除しますか?\n\n` +
      `・cartridges/${appId}/ フォルダを削除\n` +
      '・プレビュー用のマウントファイルを削除\n' +
      '・PGlite のテーブルもクリア\n\n' +
      '※ Git コミットしていない変更は失われます。',
    )) return

    setBusy(true)

    // 2 分のタイムアウト: dev server の hot-reload で応答が失われても復帰できるように
    const ctrl    = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 120_000)

    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/delete`, {
        method: 'POST',
        signal: ctrl.signal,
      })
      clearTimeout(timeout)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`削除に失敗しました: ${j.error ?? `HTTP ${res.status}`}`)
        setBusy(false)
        return
      }
      router.push('/')
    } catch (e) {
      clearTimeout(timeout)
      const err = e as Error
      if (err.name === 'AbortError') {
        // タイムアウト時: 実は削除が完了している可能性が高い (dev 環境特有の応答ロス)
        if (confirm(
          'サーバー応答が 2 分以上ありません。\n' +
          '削除は完了している可能性があります。\n\n' +
          'カートリッジ一覧に戻って確認しますか?',
        )) {
          router.push('/')
        } else {
          setBusy(false)
        }
      } else {
        alert(`削除に失敗しました: ${err.message}`)
        setBusy(false)
      }
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <AlertTriangle className="h-4 w-4" />
          危険な操作
        </CardTitle>
        <CardDescription>
          このカートリッジを完全に削除します。フォルダ・マウント・PGlite データが消えます。
          識別子 (ID) を変更したい場合は、削除して新規作成してください。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={busy}
          className="gap-1.5"
        >
          {busy
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2  className="h-3.5 w-3.5" />}
          {busy ? '削除中...' : 'このカートリッジを削除'}
        </Button>
        {busy && (
          <p className="mt-2 text-xs text-muted-foreground">
            フォルダ・マウント・PGlite テーブルを削除中です。30〜90 秒かかることがあります。
          </p>
        )}
      </CardContent>
    </Card>
  )
}
