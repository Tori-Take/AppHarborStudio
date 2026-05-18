'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useFullscreenMode } from '@/lib/use-fullscreen-mode'
import { PhaseIndicator } from '@/components/PhaseIndicator'
import { NotificationBell } from '@/components/NotificationBell'

type QrInfo = { localUrl: string; qrDataUrl: string }

type RestartPhase = 'idle' | 'signal' | 'waiting' | 'failed'

async function restartStudioDev(setPhase: (p: RestartPhase) => void): Promise<boolean> {
  setPhase('signal')
  try {
    await fetch('/api/studio/restart-dev', { method: 'POST' })
  } catch { /* expected: connection cut after kill */ }

  // health endpoint をポーリング (最大 90 秒)
  const start = Date.now()
  setPhase('waiting')
  while (Date.now() - start < 90_000) {
    await new Promise((r) => setTimeout(r, 1500))
    try {
      const r = await fetch('/api/studio/health', { cache: 'no-store' })
      if (r.ok) {
        // 復活直後は HMR client が繋ぐまで少し待つ
        await new Promise((r) => setTimeout(r, 1000))
        return true
      }
    } catch {
      // まだ落ちている — 続行
    }
  }
  return false
}

type DeployInfo = {
  branch: string
  lastCommit: { shortSha: string; date: string; subject: string } | null
  unpushedCount: number
  dirtyFiles: string[]
  github: { folderUrl: string | null; commitUrl: string | null } | null
  production: { platformUrl: string }
}

/**
 * プレビュー画面 (`/org/<slug>/apps/<appId>/...`) でのみ表示されるナビバー。
 * カートリッジ詳細ページ (`/cartridge/<appId>`) との行き来を補助する。
 *
 * apps 一覧 (`/org/<slug>/apps`) では何も表示しない。
 */
export function PreviewNav() {
  const pathname = usePathname()
  const [fullscreenMode, setFullscreenMode] = useFullscreenMode()

  const m = pathname?.match(/^\/org\/[^/]+\/apps\/([^/]+)(?:\/.*)?$/)
  const appId = m?.[1]

  const [info, setInfo] = useState<DeployInfo | null>(null)
  const [restartPhase, setRestartPhase] = useState<RestartPhase>('idle')
  const [qr, setQr] = useState<QrInfo | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [dbSource, setDbSource] = useState<'pglite' | 'docker' | 'studio-cloud'>('pglite')

  useEffect(() => {
    if (!appId) return
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/db-source`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.source) setDbSource(j.source) })
      .catch(() => {})
  }, [appId])

  useEffect(() => {
    if (!appId) return
    let cancelled = false
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/deploy-info`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (!cancelled && j) setInfo(j) })
      .catch(() => {})
    fetch('/api/studio-env')
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!cancelled && j?.localUrl) {
          const fullUrl = `${j.localUrl}${window.location.pathname}?fullscreen=1`
          fetch(`/api/studio/qr?url=${encodeURIComponent(fullUrl)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((qrJ) => {
              if (!cancelled && qrJ?.qrDataUrl) {
                setQr({ localUrl: fullUrl, qrDataUrl: qrJ.qrDataUrl })
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [appId])

  if (!appId) return null

  // 全画面表示モード中は最小限のフローティング解除ボタンのみ表示
  if (fullscreenMode) {
    return (
      <button
        onClick={() => setFullscreenMode(false)}
        title="全画面表示を解除して Studio chrome を戻す"
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.85)',
          color: '#fbbf24',
          border: '1px solid #fbbf24',
          borderRadius: 999,
          padding: '8px 12px',
          fontSize: 12,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        ⛶ 全画面解除
      </button>
    )
  }

  const handleRestart = async () => {
    const ok = await restartStudioDev(setRestartPhase)
    if (ok) {
      window.location.reload()
    } else {
      setRestartPhase('failed')
      alert('再起動タイムアウト (90秒以上応答なし)。\nターミナルでログを確認してください。')
    }
  }

  const restartLabel =
    restartPhase === 'signal'  ? '⏳ 停止しています...'
  : restartPhase === 'waiting' ? '⏳ 準備しています...'
  : restartPhase === 'failed'  ? '❌ 失敗 (再試行)'
  :                              '🔁 Studio 再起動'
  const restartBusy = restartPhase === 'signal' || restartPhase === 'waiting'

  return (
    <div
      style={{
        // 親 (右カラム) は overflow-hidden + flex-col。scroll context が無いので
        // sticky は relative 相当になり top:50 が不要なズレを生んでいた。
        // 自然な位置に固定で OK（親が flex で main が flex-1 なので位置は確定）。
        position: 'relative',
        zIndex: 49,
        background: '#0f172a',
        borderBottom: '1px solid #334155',
        padding: '8px 24px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        fontSize: 13,
      }}
    >
      <Link
        href={`/cartridge/${encodeURIComponent(appId)}`}
        style={{
          color: '#94a3b8',
          fontSize: 12,
          textDecoration: 'none',
          border: '1px solid #334155',
          borderRadius: 4,
          padding: '4px 10px',
        }}
      >
        ← カートリッジ詳細に戻る
      </Link>

      <span style={{ color: '#64748b', fontSize: 12 }}>
        プレビュー中: <code style={{ color: '#fbbf24' }}>{appId}</code>
      </span>

      <PhaseIndicator />

      {/* DB ソース表示 */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          background:
            dbSource === 'pglite'       ? 'rgba(100, 116, 139, 0.15)' :
            dbSource === 'docker'       ? 'rgba(16, 185, 129, 0.15)' :
                                          'rgba(168, 85, 247, 0.15)',
          color:
            dbSource === 'pglite'       ? '#94a3b8' :
            dbSource === 'docker'       ? '#10b981' :
                                          '#a855f7',
          border: '1px solid currentColor',
          fontFamily: 'ui-monospace, monospace',
        }}
        title="このカートリッジが今読み書きしているデータベース"
      >
        🗄
        {dbSource === 'pglite'       ? 'PGlite'            :
         dbSource === 'docker'       ? 'Docker Supabase'   :
                                       'Studio Supabase'}
      </span>

      {/* デプロイ状況のミニバッジ */}
      {info && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          {info.dirtyFiles.length > 0 ? (
            <span style={badge('#ef4444')} title={`未コミット ${info.dirtyFiles.length} 件`}>
              ⚠ 未コミット {info.dirtyFiles.length}
            </span>
          ) : info.unpushedCount > 0 ? (
            <span style={badge('#f59e0b')} title={`未 push ${info.unpushedCount} 件`}>
              ⚠ 未 push {info.unpushedCount}
            </span>
          ) : (
            <span style={badge('#10b981')} title="ローカルとリモートが同期">
              ✓ 同期
            </span>
          )}
          {info.lastCommit && (
            <span style={{ color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>
              {info.lastCommit.shortSha}
              <span style={{ color: '#475569', marginLeft: 6 }}>
                {info.lastCommit.date.slice(5, 16).replace('T', ' ')}
              </span>
            </span>
          )}
          {info.github?.folderUrl && (
            <a
              href={info.github.folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#fbbf24', textDecoration: 'none', fontSize: 11 }}
              title="GitHub で開く"
            >
              📂
            </a>
          )}
          <a
            href={info.production.platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#fbbf24', textDecoration: 'none', fontSize: 11 }}
            title="本番 AppHarbor で開く"
          >
            🚀
          </a>
        </span>
      )}

      {qr && (
        <button
          onClick={() => setShowQr(true)}
          title="スマホで QR コードをスキャンしてアクセス"
          style={{
            marginLeft: 'auto',
            color: '#94a3b8',
            fontSize: 12,
            background: 'transparent',
            border: '1px solid #334155',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          📱 スマホ
        </button>
      )}

      <button
        onClick={handleRestart}
        disabled={restartBusy}
        title="Studio dev server を kill + .next 削除 + 再起動 (webpack キャッシュ問題の解消用)"
        style={{
          marginLeft: qr ? undefined : 'auto',
          color: restartBusy ? '#fca5a5' : '#fbbf24',
          fontSize: 12,
          background: 'transparent',
          border: '1px solid ' + (restartBusy ? '#ef4444' : '#78350f'),
          borderRadius: 4,
          padding: '4px 10px',
          cursor: restartBusy ? 'wait' : 'pointer',
        }}
      >
        {restartLabel}
      </button>

      <NotificationBell appId={appId} />

      <a
        href="/inspector"
        target="_blank"
        rel="noopener"
        style={{
          color: '#94a3b8',
          fontSize: 12,
          textDecoration: 'none',
          border: '1px solid #334155',
          borderRadius: 4,
          padding: '4px 10px',
        }}
        title="DB ブラウザ / SQL コンソール / クエリログ"
      >
        🔬 Inspector
      </a>

      <button
        onClick={() => setFullscreenMode(true)}
        title="Studio chrome を非表示にしてカートリッジだけ全画面表示（F12 のスマホエミュレートと併用可）"
        style={{
          color: '#94a3b8',
          fontSize: 12,
          background: 'transparent',
          border: '1px solid #334155',
          borderRadius: 4,
          padding: '4px 10px',
          cursor: 'pointer',
        }}
      >
        ⛶ 全画面表示
      </button>

      {showQr && qr && (
        <div
          onClick={() => setShowQr(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              borderRadius: 12,
              background: '#fff',
              padding: 24,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>スマホで QR コードをスキャン</p>
            <img src={qr.qrDataUrl} alt="QR Code" width={200} height={200} />
            <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>{qr.localUrl}</span>
            <button
              onClick={() => setShowQr(false)}
              style={{
                marginTop: 4,
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '6px 16px',
                fontSize: 12,
                color: '#64748b',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function badge(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    color,
    border: `1px solid ${color}`,
    background: `${color}15`,
    borderRadius: 3,
    padding: '1px 6px',
    fontSize: 10,
    fontWeight: 600,
    fontFamily: 'ui-monospace, monospace',
  }
}
