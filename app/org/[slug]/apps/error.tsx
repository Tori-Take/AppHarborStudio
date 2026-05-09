'use client'

/**
 * Studio: カートリッジ実行中の例外をキャッチして friendly UI を出す。
 *
 * 特に `requireApp` / `requireActor` が投げた権限エラー
 * (StudioPermErrorPayload) を検出した場合は、
 * 「現在ユーザー / orgRole / appRole / どうすれば解決するか」を表示し、
 * org-admin ユーザーへワンクリック切替できるようにする。
 */

import { useEffect, useState } from 'react'
import { isStudioPermError, type StudioPermErrorPayload } from '@/lib/sdk-mock/perm-error'
import { useStudioStore, STUDIO_USER_COOKIE } from '@/lib/sdk-mock/store'

function setUserCookie(id: string) {
  document.cookie = `${STUDIO_USER_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`
}

export default function CartridgeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [perm, setPerm] = useState<StudioPermErrorPayload | null>(null)
  useEffect(() => {
    setPerm(isStudioPermError(error.message))
  }, [error.message])

  const users         = useStudioStore((s) => s.users)
  const setCurrentUser = useStudioStore((s) => s.setCurrentUser)

  // 権限エラーでなければ素朴に再描画 / メッセージ表示
  if (!perm) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>⚠ カートリッジ実行エラー</h1>
        <pre style={preStyle}>{error.message}</pre>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={reset} style={primaryBtn}>もう一度試す</button>
          <button onClick={() => window.location.reload()} style={secondaryBtn}>ページを再読込</button>
        </div>
      </div>
    )
  }

  const orgAdmins = users.filter((u) => u.orgRole === 'org-admin')
  const deptAdmins = users.filter((u) => u.orgRole === 'dept-admin')

  const onSwitch = (id: string) => {
    setCurrentUser(id)
    setUserCookie(id)
    window.location.reload()
  }

  const kindLabel = {
    'org-access':        '組織アクセス権がありません',
    'role-missing':      'app-role が解決できません',
    'role-check-failed': 'このページに必要なロールではありません',
  }[perm.kind]

  return (
    <div style={containerStyle}>
      <div style={{
        background: '#fef3c7', border: '2px solid #f59e0b',
        borderRadius: 8, padding: 16, marginBottom: 20,
      }}>
        <h1 style={{ ...titleStyle, color: '#78350f', margin: 0 }}>
          🔒 {kindLabel}
        </h1>
        <p style={{ marginTop: 8, color: '#78350f', fontSize: 13 }}>{perm.hint}</p>
      </div>

      <section style={cardStyle}>
        <h2 style={h2Style}>現在のユーザー</h2>
        <table style={tableStyle}>
          <tbody>
            <tr><td style={tdLabel}>名前</td><td style={tdVal}>{perm.userName}</td></tr>
            <tr><td style={tdLabel}>org-role</td><td style={tdVal}><code>{perm.orgRole}</code></td></tr>
            <tr><td style={tdLabel}>app-role</td><td style={tdVal}><code>{perm.appRole ?? '(解決失敗)'}</code></td></tr>
            {perm.appId && <tr><td style={tdLabel}>app</td><td style={tdVal}><code>{perm.appId}</code></td></tr>}
          </tbody>
        </table>
      </section>

      {orgAdmins.length > 0 && (
        <section style={cardStyle}>
          <h2 style={h2Style}>👑 管理者ユーザーへ切替（admin app-role 自動付与）</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {orgAdmins.map((u) => (
              <button key={u.id} onClick={() => onSwitch(u.id)} style={primaryBtn}>
                {u.actorName.replace(/（.*）/, '')} に切替
              </button>
            ))}
          </div>
        </section>
      )}

      {deptAdmins.length > 0 && perm.kind === 'role-check-failed' && (
        <section style={cardStyle}>
          <h2 style={h2Style}>🏢 部署管理者ユーザーへ切替</h2>
          <p style={hintStyle}>
            ※ 多くのカートリッジで dept-admin の app-role は <code>member</code> 相当です。
            この画面が dept-admin で見られるかどうかはカートリッジ次第。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {deptAdmins.slice(0, 6).map((u) => (
              <button key={u.id} onClick={() => onSwitch(u.id)} style={secondaryBtn}>
                {u.actorName.replace(/（.*）/, '')}
              </button>
            ))}
          </div>
        </section>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>🛠 その他</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={reset} style={secondaryBtn}>もう一度試す</button>
          <button onClick={() => history.back()} style={secondaryBtn}>← 戻る</button>
          <button onClick={() => window.location.reload()} style={secondaryBtn}>ページ再読込</button>
        </div>
        <p style={hintStyle}>
          💡 右側の「アプリ権限」パネルから、特定ユーザーの app-role を <code>admin</code> に
          上書きすることもできます。
        </p>
      </section>
    </div>
  )
}

// ── styles ──
const containerStyle: React.CSSProperties = {
  maxWidth: 720, margin: '32px auto', padding: 24,
  fontSize: 13, color: '#0f172a',
}
const titleStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 700, margin: '0 0 12px',
}
const cardStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: 16, marginBottom: 12,
}
const h2Style: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, margin: '0 0 10px', color: '#334155',
}
const tableStyle: React.CSSProperties = { width: '100%', fontSize: 12 }
const tdLabel: React.CSSProperties = {
  color: '#64748b', padding: '3px 8px 3px 0', width: 90,
}
const tdVal: React.CSSProperties = { padding: '3px 0' }
const primaryBtn: React.CSSProperties = {
  background: '#fbbf24', color: '#0b1322', border: 'none',
  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
}
const secondaryBtn: React.CSSProperties = {
  background: 'white', color: '#334155', border: '1px solid #cbd5e1',
  padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
}
const preStyle: React.CSSProperties = {
  background: '#f1f5f9', padding: 12, borderRadius: 6,
  fontSize: 11, overflow: 'auto', whiteSpace: 'pre-wrap',
}
const hintStyle: React.CSSProperties = {
  fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.6,
}
