'use client'

import { useState } from 'react'

type PushResult =
  | { ok: true; commitHash: string; message: string; changedFiles: string[]; pushOutput: string }
  | { ok: false; error: string }

/**
 * カートリッジを git で本番に push するボタン。
 *
 * ローカル Studio から呼ぶ前提。
 * 動作:
 *   1. クリックで確認ダイアログ
 *   2. コミットメッセージを入力
 *   3. /api/cartridges/{id}/push を叩く
 *   4. 結果表示（成功なら commit hash・push 内容、失敗ならエラー）
 */
export function PushButton({ appId, appName }: { appId: string; appName?: string }) {
  const [open,   setOpen]   = useState(false)
  const [busy,   setBusy]   = useState(false)
  const [result, setResult] = useState<PushResult | null>(null)
  const [message, setMessage] = useState(`feat: ${appName ?? appId} 更新`)

  const submit = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const j = await res.json()
      if (!res.ok) {
        setResult({ ok: false, error: j.error ?? 'push に失敗しました' })
      } else {
        setResult({ ok: true, ...j })
      }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={panelStyle}>
      <div style={{ ...labelStyle, color: '#10b981' }}>🚀 本番に反映 (git push)</div>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 12px' }}>
        このカートリッジを GitHub に push し、Vercel で本番反映します。
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} style={btnPrimary}>
          🚀 push する
        </button>
      ) : (
        <>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
            コミットメッセージ
          </label>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
            style={{
              width: '100%', marginBottom: 8,
              background: '#0f172a', color: '#e2e8f0',
              border: '1px solid #334155', borderRadius: 4,
              padding: '6px 10px', fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={submit} disabled={busy || !message.trim()} style={btnPrimary}>
              {busy ? '実行中...' : '✓ 確認: push 実行'}
            </button>
            <button onClick={() => { setOpen(false); setResult(null) }} disabled={busy} style={btnGhost}>
              キャンセル
            </button>
          </div>
        </>
      )}

      {result?.ok && (
        <div style={{
          marginTop: 12, padding: 10,
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid #10b981',
          borderRadius: 6,
          fontSize: 12, color: '#a7f3d0',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>✓ push 成功!</div>
          <div>commit: <code style={{ color: '#fbbf24' }}>{result.commitHash}</code></div>
          <div>message: {result.message}</div>
          {result.changedFiles.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
                変更ファイル ({result.changedFiles.length})
              </summary>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 11 }}>
                {result.changedFiles.map((f, i) => <li key={i}><code>{f}</code></li>)}
              </ul>
            </details>
          )}
          <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
            Vercel で自動デプロイが始まります。<br />
            完了したら AppHarbor の <code>/platform/apps</code> でインストール可能になります。
          </div>
        </div>
      )}

      {result && !result.ok && (
        <div style={{
          marginTop: 12, padding: 10,
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: 6,
          fontSize: 12, color: '#fca5a5',
          whiteSpace: 'pre-wrap',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>✗ エラー</div>
          {result.error}
        </div>
      )}
    </section>
  )
}

const panelStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
}
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 8,
  fontWeight: 600,
}
const btnPrimary: React.CSSProperties = {
  background: '#10b981', color: 'white',
  border: 'none', borderRadius: 6,
  padding: '8px 16px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8',
  border: '1px solid #334155', borderRadius: 6,
  padding: '8px 14px', fontSize: 13, cursor: 'pointer',
}
