'use client'

import { useState } from 'react'

type Props = { appId: string }

/**
 * カートリッジの「マウントファイル + PGlite データ」を初期化するボタン（アコーディオン折りたたみ）。
 *
 * 通常は「デプロイ完了で自動リセット」が効くので隠しておき、
 * 自動が動かない・キャッシュ事故の保険として開けるようにする。
 *
 * - studio/app/org/[slug]/apps/<id>/ のマウント先を削除
 * - PGlite のカートリッジテーブルを DROP → schema.sql で再作成
 * - ページ再読み込み
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
    <details style={{
      marginTop: 8,
      fontSize: 12,
      color: '#64748b',
    }}>
      <summary style={{
        cursor: 'pointer',
        userSelect: 'none',
        padding: '4px 0',
      }}>
        ⚠ 開発をリセット（自動リセットが効かない時用）
      </summary>

      <div style={{
        marginTop: 8,
        padding: 10,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 6,
      }}>
        <p style={{ margin: '0 0 8px', lineHeight: 1.7, color: '#94a3b8' }}>
          マウント済みファイルと PGlite データを初期化します。
          <strong style={{ color: '#cbd5e1' }}>ソースコードと Git 履歴は消えません。</strong>
        </p>
        <button
          onClick={handleReset}
          disabled={busy}
          style={{
            background: busy ? '#64748b' : 'transparent',
            color: busy ? '#fee2e2' : '#fca5a5',
            border: '1px solid #ef4444',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'リセット中...' : '🔄 初期化する'}
        </button>
        {error && (
          <div style={{
            marginTop: 6, padding: '4px 8px',
            color: '#fca5a5', background: '#ef444415',
            border: '1px solid #ef4444', borderRadius: 4, fontSize: 11,
          }}>
            {error}
          </div>
        )}
      </div>
    </details>
  )
}
