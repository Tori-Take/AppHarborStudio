'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnnouncementRow } from '@/lib/sdk-mock'

const POLL_INTERVAL_MS = 5000

type ApiResponse = { items: AnnouncementRow[]; unreadCount: number }

type Props = {
  /** プレビュー中カートリッジ ID。テスト通知発火時の source_app_id に使う */
  appId?: string
}

export function NotificationBell({ appId }: Props) {
  const [items, setItems] = useState<AnnouncementRow[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' })
      if (!r.ok) return
      const json = (await r.json()) as ApiResponse
      setItems(json.items)
      setUnread(json.unreadCount)
    } catch { /* network error - ignore */ }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [refresh])

  // ポップオーバー外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const markRead = async (id: string) => {
    await fetch('/api/notifications', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ action: 'mark-read', id }),
    })
    refresh()
  }

  const markAllRead = async () => {
    setBusy(true)
    try {
      await fetch('/api/notifications', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ action: 'mark-all-read' }),
      })
      refresh()
    } finally { setBusy(false) }
  }

  const sendTest = async () => {
    setBusy(true)
    try {
      await fetch('/api/notifications/test', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ appId: appId ?? 'studio-test' }),
      })
      refresh()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="カートリッジ通知（インフォ）"
        style={{
          position: 'relative',
          color: unread > 0 ? '#fbbf24' : '#94a3b8',
          fontSize: 14,
          background: 'transparent',
          border: '1px solid ' + (unread > 0 ? '#78350f' : '#334155'),
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
              padding: '0 4px',
              borderRadius: 999,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 60,
            width: 360,
            maxHeight: 480,
            display: 'flex',
            flexDirection: 'column',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid #1e293b',
              fontSize: 12,
              color: '#cbd5e1',
            }}
          >
            <span style={{ fontWeight: 600 }}>カートリッジ通知</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={sendTest}
                disabled={busy}
                title="テスト通知を 1 件発火（sdk.notify() を内部で呼ぶ）"
                style={smallBtn('#a855f7')}
              >
                ＋ テスト
              </button>
              <button
                onClick={markAllRead}
                disabled={busy || unread === 0}
                title="すべて既読にする"
                style={smallBtn('#64748b', unread === 0)}
              >
                すべて既読
              </button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {items.length === 0 ? (
              <p style={{ padding: 24, color: '#64748b', fontSize: 12, textAlign: 'center' }}>
                まだ通知はありません。
                <br />
                <code style={{ color: '#94a3b8' }}>sdk.notify(&#123;...&#125;)</code> から発火するか、
                上の「＋ テスト」ボタンを試してください。
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((n) => (
                  <li
                    key={n.id}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid #1e293b',
                      background: n.readAt === null ? 'rgba(251, 191, 36, 0.06)' : 'transparent',
                      cursor: n.readAt === null ? 'pointer' : 'default',
                      fontSize: 12,
                    }}
                    onClick={() => n.readAt === null && markRead(n.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                      <span
                        style={{
                          color: '#fbbf24',
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: 10,
                        }}
                      >
                        {n.sourceAppId}
                      </span>
                      <span style={{ color: '#475569', fontSize: 10 }}>
                        {formatTime(n.createdAt)}
                      </span>
                    </div>
                    <div style={{ color: '#f1f5f9', fontWeight: n.readAt === null ? 600 : 400 }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ color: '#94a3b8', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                        {n.body}
                      </div>
                    )}
                    {n.link && (
                      <a
                        href={n.link}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: '#60a5fa', fontSize: 11, marginTop: 4, display: 'inline-block' }}
                      >
                        {n.link} ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function smallBtn(color: string, disabled = false): React.CSSProperties {
  return {
    color: disabled ? '#475569' : color,
    fontSize: 11,
    background: 'transparent',
    border: `1px solid ${disabled ? '#1e293b' : color}`,
    borderRadius: 4,
    padding: '2px 8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = Date.now()
    const diffSec = Math.floor((now - d.getTime()) / 1000)
    if (diffSec < 60)     return `${diffSec}秒前`
    if (diffSec < 3600)   return `${Math.floor(diffSec / 60)}分前`
    if (diffSec < 86400)  return `${Math.floor(diffSec / 3600)}時間前`
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  } catch { return iso }
}
