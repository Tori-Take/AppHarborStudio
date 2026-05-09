'use client'

import { useEffect, useState } from 'react'
import { DeployReadyWatcher } from './DeployReadyWatcher'

type DeployInfo = {
  appId: string
  branch: string
  repoHead: string
  lastCommit: { fullSha: string; shortSha: string; date: string; author: string; subject: string } | null
  unpushedCount: number
  dirtyFiles: string[]
  github: { base: string; folderUrl: string | null; commitUrl: string | null } | null
  production: { baseUrl: string; platformUrl: string }
}

type Props = { appId: string }

export function DeployInfoPanel({ appId }: Props) {
  const [info, setInfo] = useState<DeployInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [pushResult, setPushResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/deploy-info`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((j: DeployInfo) => { if (!cancelled) setInfo(j) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [appId, refreshTick])

  const handlePush = async () => {
    if (pushBusy) return
    setPushBusy(true)
    setPushResult(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: pushMessage.trim() || undefined }),
      })
      const j = await res.json()
      if (res.ok) {
        // push 成功後、Studio プレビュー用コピーも更新（HMR 強制込み）
        try { await fetch('/api/mount', { method: 'POST' }) } catch { /* ignore */ }
        setPushResult({ ok: true, text: `✓ push 完了: ${j.commitHash ?? ''}（プレビューも更新済み）` })
        setPushMessage('')
        setRefreshTick((t) => t + 1)
      } else {
        setPushResult({ ok: false, text: j.error ?? `HTTP ${res.status}` })
      }
    } catch (e) {
      setPushResult({ ok: false, text: (e as Error).message })
    } finally {
      setPushBusy(false)
    }
  }

  if (error) {
    return (
      <section style={panel}>
        <div style={label}>📡 デプロイ情報</div>
        <div style={{ fontSize: 13, color: '#fca5a5' }}>取得失敗: {error}</div>
      </section>
    )
  }

  if (!info) {
    return (
      <section style={panel}>
        <div style={label}>📡 デプロイ情報</div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>読み込み中...</div>
      </section>
    )
  }

  const hasDirty   = info.dirtyFiles.length > 0
  const hasUnpush  = info.unpushedCount > 0
  const inSync     = !hasDirty && !hasUnpush

  return (
    <section style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={label}>📡 デプロイ情報</div>
        <button
          onClick={() => setRefreshTick((t) => t + 1)}
          style={btnGhost}
          title="再取得"
        >
          🔄 更新
        </button>
      </div>

      {/* 同期状態の総合バッジ */}
      <div style={{ marginBottom: 12 }}>
        {inSync && <Badge color="#10b981">✓ ローカルと本番リポは同期</Badge>}
        {hasDirty && <Badge color="#ef4444">⚠ 未コミットの変更 {info.dirtyFiles.length} 件</Badge>}
        {hasUnpush && <Badge color="#f59e0b">⚠ 未 push コミット {info.unpushedCount} 件</Badge>}
      </div>

      {/* 詳細 */}
      <Row label="ブランチ">
        <code style={{ color: '#fbbf24' }}>{info.branch}</code>
      </Row>

      {info.lastCommit ? (
        <Row label="最終 commit">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div>
              <code style={{ color: '#fbbf24' }}>{info.lastCommit.shortSha}</code>
              <span style={{ color: '#64748b', marginLeft: 8 }}>
                {info.lastCommit.date.slice(0, 19)}
              </span>
              <span style={{ color: '#64748b', marginLeft: 8 }}>
                by {info.lastCommit.author}
              </span>
            </div>
            <div style={{ color: '#cbd5e1', fontSize: 12 }}>
              {info.lastCommit.subject}
            </div>
          </div>
        </Row>
      ) : (
        <Row label="最終 commit">
          <span style={{ color: '#94a3b8' }}>まだ commit がありません（git に追加されていない可能性）</span>
        </Row>
      )}

      {hasDirty && (
        <Row label="未コミットファイル">
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#fca5a5' }}>
            {info.dirtyFiles.slice(0, 5).map((f) => <li key={f}><code>{f}</code></li>)}
            {info.dirtyFiles.length > 5 && <li>...他 {info.dirtyFiles.length - 5} 件</li>}
          </ul>
        </Row>
      )}

      {/* push 操作: 未コミット or 未 push がある時のみ */}
      {!inSync && (
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: '1px solid #334155',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <input
              value={pushMessage}
              onChange={(e) => setPushMessage(e.target.value)}
              placeholder={hasDirty ? `commit メッセージ（任意・空なら "feat: ${appId} 更新"）` : '未 push の commit を送信します'}
              disabled={pushBusy || !hasDirty}
              style={{
                flex: 1, minWidth: 240,
                background: '#0f172a', color: '#e2e8f0',
                border: '1px solid #334155', borderRadius: 6,
                padding: '6px 10px', fontSize: 12,
              }}
            />
            <button onClick={handlePush} disabled={pushBusy} style={btnPush(pushBusy)}>
              {pushBusy
                ? '送信中...'
                : hasDirty
                  ? `🚀 コミット & push（${info.dirtyFiles.length} 件）`
                  : `🚀 push（${info.unpushedCount} 件）`}
            </button>
          </div>
          {pushResult && (
            <div style={{
              fontSize: 12, padding: '6px 10px', borderRadius: 4,
              color: pushResult.ok ? '#10b981' : '#fca5a5',
              background: pushResult.ok ? '#10b98115' : '#ef444415',
              border: `1px solid ${pushResult.ok ? '#10b981' : '#ef4444'}`,
              whiteSpace: 'pre-wrap',
            }}>
              {pushResult.text}
            </div>
          )}
        </div>
      )}

      {/* リンク類 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid #334155' }}>
        {info.github?.folderUrl && (
          <a href={info.github.folderUrl} target="_blank" rel="noopener noreferrer" style={btnLink}>
            📂 GitHub で開く
          </a>
        )}
        {info.github?.commitUrl && info.lastCommit && (
          <a href={info.github.commitUrl} target="_blank" rel="noopener noreferrer" style={btnLink}>
            🔖 commit {info.lastCommit.shortSha} を見る
          </a>
        )}
        <a href={info.production.platformUrl} target="_blank" rel="noopener noreferrer" style={btnLink}>
          🚀 本番 AppHarbor で開く
        </a>
      </div>

      {/* 本番監視（常時 ON で動作。デプロイ Ready で自動的にマウント・PGlite クリア） */}
      {info.repoHead && (
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: '1px solid #334155',
        }}>
          <DeployReadyWatcher
            appId={appId}
            baseUrl={info.production.baseUrl}
            localFullSha={info.repoHead}
            enabled={true}
          />
        </div>
      )}

      <p style={{ fontSize: 11, color: '#64748b', margin: '10px 0 0' }}>
        本番 URL は <code>STUDIO_PRODUCTION_URL</code> 環境変数で変更可（現在: {info.production.baseUrl}）。
      </p>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13, padding: '6px 0', borderBottom: '1px dashed #1e293b' }}>
      <div style={{ color: '#94a3b8', minWidth: 100 }}>{label}</div>
      <div style={{ flex: 1, color: '#e2e8f0' }}>{children}</div>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      marginRight: 8, marginBottom: 4,
      padding: '3px 10px',
      fontSize: 11, fontWeight: 600,
      color, border: `1px solid ${color}`, borderRadius: 4,
      background: `${color}15`,
    }}>
      {children}
    </span>
  )
}

const panel: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
}

const label: React.CSSProperties = {
  fontSize: 12, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: 0.5,
}

const btnGhost: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8',
  border: '1px solid #334155', borderRadius: 6,
  padding: '4px 10px', fontSize: 11, cursor: 'pointer',
}

const btnPush = (busy: boolean): React.CSSProperties => ({
  background: busy ? '#64748b' : '#fbbf24',
  color: '#1f2937',
  border: 'none', borderRadius: 6,
  padding: '6px 14px', fontSize: 12, fontWeight: 700,
  cursor: busy ? 'wait' : 'pointer',
  whiteSpace: 'nowrap',
})

const btnLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#0f172a', color: '#fbbf24',
  border: '1px solid #334155', borderRadius: 6,
  padding: '6px 12px', fontSize: 12,
  textDecoration: 'none',
}
