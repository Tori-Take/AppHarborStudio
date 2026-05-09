'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 本番 AppHarbor の `/api/git-sha` をポーリングし、
 * 直近 push した commit が Ready になったら開発リセットを自動実行する。
 *
 * 動作概要:
 *   - 親（DeployInfoPanel）から最新ローカル commit と本番 baseUrl を受け取る
 *   - 5 秒間隔で baseUrl + /api/git-sha を fetch
 *   - 取得した sha が「前回見た本番 sha」と異なれば「本番更新あり」とみなす
 *   - 本番 sha == ローカル sha になった瞬間 + ユーザーが自動リセットを ON にしている場合 → reset API
 *
 * リセット後は localStorage の step を 1 にして reload。
 *
 * ON/OFF は localStorage `appharbor_studio_auto_reset_<appId>` で管理。
 */

const TOGGLE_KEY = (appId: string) => `appharbor_studio_auto_reset_${appId}`
const LAST_PROD_KEY = (appId: string) => `appharbor_studio_last_prod_sha_${appId}`
const PUBLISHED_KEY = (appId: string) => `appharbor_studio_published_${appId}`

const POLL_INTERVAL_MS = 5000

type Props = {
  appId: string
  baseUrl: string         // 本番 AppHarbor の URL
  localFullSha: string    // 比較対象の sha（リポジトリの HEAD を渡す）
  enabled: boolean        // 親の自動リセットトグル
  onReset?: () => void    // リセット完了通知
}

type Status =
  | { kind: 'idle' }
  | { kind: 'building'; prodSha: string }
  | { kind: 'ready';    prodSha: string }
  | { kind: 'error';    message: string }

export function DeployReadyWatcher({ appId, baseUrl, localFullSha, enabled, onReset }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [toast, setToast]   = useState<{ kind: 'info' | 'success' | 'error'; text: string } | null>(null)
  const triggeredRef        = useRef<string | null>(null)  // 既に reset 起動済みの sha

  useEffect(() => {
    if (!enabled || !localFullSha || !baseUrl) {
      setStatus({ kind: 'idle' })
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      try {
        const url = `${baseUrl.replace(/\/$/, '')}/api/git-sha?_=${Date.now()}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = await res.json() as { sha: string }
        const prodSha = j.sha

        if (cancelled) return

        // 前回見た本番 sha
        let lastProdSha: string | null = null
        try { lastProdSha = localStorage.getItem(LAST_PROD_KEY(appId)) } catch { /* ignore */ }

        // 本番 sha がローカル sha と一致 = Ready
        if (prodSha === localFullSha) {
          setStatus({ kind: 'ready', prodSha })

          // 同じ sha で重複起動を防ぐ
          if (triggeredRef.current !== prodSha) {
            // 「直前の本番 sha がローカルと違っていた」場合だけ自動リセット発火
            // = 本当にこの push でデプロイが進んだ場合のみ
            if (lastProdSha && lastProdSha !== prodSha) {
              triggeredRef.current = prodSha
              await runReset()
            }
          }
        } else {
          setStatus({ kind: 'building', prodSha })
        }

        try { localStorage.setItem(LAST_PROD_KEY(appId), prodSha) } catch { /* ignore */ }
      } catch (e) {
        if (!cancelled) setStatus({ kind: 'error', message: (e as Error).message })
      }

      if (!cancelled) {
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    const runReset = async () => {
      setToast({ kind: 'info', text: '🚀 デプロイ Ready を検知 — マウント/DB をクリア中...' })
      try {
        const r = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/reset`, { method: 'POST' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        // 公開完了の記録を保存（PublishedBadge が読み取って Step ③ に表示）
        try {
          localStorage.setItem(
            PUBLISHED_KEY(appId),
            JSON.stringify({ sha: localFullSha, publishedAt: new Date().toISOString() }),
          )
        } catch { /* ignore */ }
        setToast({ kind: 'success', text: '✓ デプロイ完了 — マウント済みファイルと PGlite データをクリアしました' })
        if (onReset) onReset()
        // 4 秒後に再読み込みで状態を反映（ステップは維持）
        setTimeout(() => window.location.reload(), 4000)
      } catch (e) {
        setToast({ kind: 'error', text: `リセット失敗: ${(e as Error).message}` })
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [appId, baseUrl, localFullSha, enabled, onReset])

  // トースト自動消去
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  if (!enabled) return null

  return (
    <>
      {/* インライン状態表示 */}
      <div style={{
        marginTop: 6, fontSize: 11,
        color: status.kind === 'ready' ? '#10b981'
             : status.kind === 'building' ? '#f59e0b'
             : status.kind === 'error' ? '#fca5a5'
             : '#64748b',
        fontFamily: 'ui-monospace, monospace',
      }}>
        {status.kind === 'idle'     && '本番 sha 監視中...'}
        {status.kind === 'building' && `本番デプロイ進行中: ${status.prodSha.slice(0, 7)}（ローカルと不一致）`}
        {status.kind === 'ready'    && `✓ 本番 Ready: ${status.prodSha.slice(0, 7)}`}
        {status.kind === 'error'    && `本番監視エラー: ${status.message}`}
      </div>

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24, right: 24,
          zIndex: 1000,
          padding: '12px 16px',
          background:
            toast.kind === 'success' ? '#065f46'
            : toast.kind === 'error' ? '#7f1d1d'
            : '#1e293b',
          color: '#fff',
          borderLeft: `4px solid ${
            toast.kind === 'success' ? '#10b981'
            : toast.kind === 'error' ? '#ef4444'
            : '#fbbf24'
          }`,
          borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          fontSize: 13,
          maxWidth: 360,
        }}>
          {toast.text}
        </div>
      )}
    </>
  )
}
