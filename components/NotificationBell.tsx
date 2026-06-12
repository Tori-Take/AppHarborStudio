'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type NotificationItem = {
  id:          string
  sourceAppId: string
  scope:       string
  title:       string
  body:        string
  link:        string | null
  createdAt:   string
  readAt:      string | null
}

/**
 * Studio chrome の通知ベル。
 * カートリッジの notify() が PGlite の notifications へ INSERT したものを表示する。
 * ユーザー切替（RoleSwitcher）に追従するよう、開くたびに再取得する。
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      setItems(j.notifications ?? [])
      setUnread(j.unreadCount ?? 0)
    } catch { /* dev server 再起動中など。次の更新で回復する */ }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const handleToggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      await refresh()
      // 開いた時点で表示中の通知を既読化（本体ヘッダーベルと同じ挙動）
      if (unread > 0) {
        try {
          await fetch('/api/notifications', { method: 'POST' })
          setUnread(0)
          setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
        } catch { /* 既読化失敗は次回に持ち越し */ }
      }
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={handleToggle}
        title="通知（カートリッジの notify() で送られたお知らせ）"
        style={{
          position: 'relative',
          color: '#94a3b8',
          fontSize: 12,
          background: 'transparent',
          border: '1px solid #334155',
          borderRadius: 4,
          padding: '4px 10px',
          cursor: 'pointer',
        }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 100,
            width: 320,
            maxHeight: 360,
            overflowY: 'auto',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: 8,
          }}
        >
          <div style={{ color: '#64748b', fontSize: 11, padding: '2px 8px 6px' }}>
            通知 — notify() で送られたお知らせ
          </div>
          {items.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 12, padding: '12px 8px' }}>
              通知はありません
            </div>
          ) : (
            items.map((n) => (
              <a
                key={n.id}
                href={n.link ?? undefined}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  padding: '8px',
                  borderRadius: 6,
                  background: n.readAt ? 'transparent' : 'rgba(251, 191, 36, 0.08)',
                  cursor: n.link ? 'pointer' : 'default',
                }}
              >
                <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>
                  {n.title}
                </div>
                {n.body && (
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{n.body}</div>
                )}
                <div style={{ color: '#475569', fontSize: 10, marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                  {n.sourceAppId} ・ {n.createdAt.slice(0, 16).replace('T', ' ')}
                  {n.scope !== 'org' && ` ・ ${n.scope === 'dept' ? '部署宛' : '自分宛'}`}
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  )
}
