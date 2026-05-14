'use client'

import { useState } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = { appId: string }

/**
 * カートリッジの「マウントファイル + PGlite データ」を初期化するボタン（折りたたみ）。
 *
 * 通常は自動リセットが効くので隠しておき、キャッシュ事故等の保険として開ける。
 *
 * cartridges/<id>/ ソースと git 履歴は触らない。
 */
export function ResetCartridgeButton({ appId }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReset = async () => {
    if (busy) return
    if (!confirm(
      `「${appId}」をリセットしますか?\n\n` +
      '・プレビュー用のマウントファイルを削除\n' +
      '・PGlite のテーブル（スコア等）をクリア\n\n' +
      '※ ソースコード（cartridges/）と Git 履歴は影響を受けません。',
    )) return

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/reset`, {
        method: 'POST',
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error ?? `HTTP ${res.status}`)
        setBusy(false)
        return
      }
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="inline-flex cursor-pointer select-none items-center gap-1 py-1 hover:text-foreground">
        <AlertTriangle className="h-3 w-3" />
        開発をリセット（自動リセットが効かない時用）
      </summary>

      <div className="mt-2 rounded-md border bg-muted/30 p-3">
        <p className="mb-2 leading-relaxed">
          マウント済みファイルと PGlite データを初期化します。
          <strong className="text-foreground">ソースコードと Git 履歴は消えません。</strong>
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleReset}
          disabled={busy}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {busy ? 'リセット中...' : '初期化する'}
        </Button>
        {error && (
          <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </details>
  )
}
