'use client'

import { useEffect, useState } from 'react'

const MODE_KEY = (appId: string) => `appharbor_studio_mode_${appId}`

type DeployInfo = {
  appId: string
  repoHead: string
  lastCommit: { fullSha: string; shortSha: string; date: string } | null
  dirtyFiles: string[]
  unpushedCount: number
  production: { baseUrl: string; platformUrl: string }
}

/**
 * 「✓ 公開完了」バッジ。
 *
 * ローカル最終 commit と本番 git-sha をライブで比較し、
 * 一致 + 未コミット/未 push なし、の時だけ表示する。
 *
 * 修正を加えて未コミットになる、または push 後に Vercel ビルド中なら
 * sha がずれて自然に非表示になる。
 */
export function PublishedBadge({ appId }: { appId: string }) {
  const [info, setInfo]      = useState<DeployInfo | null>(null)
  const [prodSha, setProdSha] = useState<string | null>(null)
  const [installed, setInstalled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    const loadDeployInfo = () => {
      fetch(`/api/cartridges/${encodeURIComponent(appId)}/deploy-info`)
        .then((r) => r.ok ? r.json() : null)
        .then((j) => { if (!cancelled && j) setInfo(j) })
        .catch(() => {})
    }

    const pollProdSha = async (info: DeployInfo) => {
      try {
        const url = `${info.production.baseUrl.replace(/\/$/, '')}/api/git-sha?_=${Date.now()}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const j = await res.json() as { sha: string }
        if (!cancelled) setProdSha(j.sha)
      } catch { /* ignore */ }
    }

    loadDeployInfo()

    // info が来たら本番 sha も並列で取り、以降 30 秒毎に更新
    const checkInterval = setInterval(loadDeployInfo, 30000)

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
      clearInterval(checkInterval)
    }
  }, [appId])

  // info が更新されるたびに本番 sha と install 状態を取りに行く
  useEffect(() => {
    if (!info) return
    let cancelled = false
    const base = info.production.baseUrl.replace(/\/$/, '')
    const fetchProd = async () => {
      try {
        const res = await fetch(`${base}/api/git-sha?_=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const j = await res.json() as { sha: string }
        if (!cancelled) setProdSha(j.sha)
      } catch { /* ignore */ }
    }
    const fetchInstalled = async () => {
      try {
        const res = await fetch(`${base}/api/apps/${encodeURIComponent(appId)}/installed?_=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const j = await res.json() as { installed: boolean }
        if (!cancelled) setInstalled(j.installed)
      } catch {
        if (!cancelled) setInstalled(null)
      }
    }
    fetchProd()
    fetchInstalled()
    const t = setInterval(() => { fetchProd(); fetchInstalled() }, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [info, appId])

  if (!info || !info.lastCommit || !prodSha) return null

  // 同期済み判定: 本番 sha == リポジトリの HEAD commit + dirty/unpushed なし
  // （カートリッジ最終 commit ではなく HEAD を使うのは、他のカートリッジや
  //   Studio 側だけ変更された commit が本番にデプロイされても OK と扱うため）
  const isPublished =
    prodSha === info.repoHead &&
    info.dirtyFiles.length === 0 &&
    info.unpushedCount === 0

  if (!isPublished) return null

  const goToDevelop = () => {
    try { localStorage.setItem(MODE_KEY(appId), 'develop') } catch { /* ignore */ }
    window.location.reload()
  }

  const ago = describeAgo(new Date(info.lastCommit.date))

  return (
    <section style={{
      background: '#0d2820',
      border: '1px solid #10b981',
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>🎉</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>
            ✓ 公開完了
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            <code style={{ color: '#fbbf24' }}>{info.lastCommit.shortSha}</code>
            {' '}が本番で稼働中（commit: {ago}）
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {installed === false ? (
          // 未インストール: 管理画面の install 動線へ誘導
          <a
            href={`${info.production.baseUrl.replace(/\/$/, '')}/platform/apps`}
            target="_blank"
            rel="noopener noreferrer"
            style={btnLink}
            title="本番 AppHarbor にこのカートリッジをインストール（apps テーブルへ登録）"
          >
            📦 本番にインストール
          </a>
        ) : (
          // インストール済み or 不明（権限なしで取得失敗等）: 動作確認リンクを表示
          <a
            href={`${info.production.baseUrl.replace(/\/$/, '')}/org/platform-preview/apps/${appId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={btnLink}
            title="プレビュー組織でアプリ画面を直接開く"
          >
            🎮 本番で動作確認
          </a>
        )}
        <a
          href={info.production.platformUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={btnGhost}
          title="管理画面（設定・有効化組織）"
        >
          ⚙ 管理画面
        </a>
        <button onClick={goToDevelop} style={btnPrimary}>
          ✏️ 次の修正に入る (開発モードへ)
        </button>
      </div>
      {installed === false && (
        <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 8, marginBottom: 0 }}>
          ⓘ まだ AppHarbor 本体にインストールされていません。「📦 本番にインストール」から登録すると動作確認ができるようになります。
        </p>
      )}
    </section>
  )
}

function describeAgo(d: Date): string {
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60)    return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60)    return `${min} 分前`
  const hr  = Math.floor(min / 60)
  if (hr  < 24)    return `${hr} 時間前`
  const day = Math.floor(hr / 24)
  return `${day} 日前`
}

const btnLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#0f172a', color: '#fbbf24',
  border: '1px solid #334155', borderRadius: 6,
  padding: '6px 12px', fontSize: 12,
  textDecoration: 'none',
}

const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'transparent', color: '#94a3b8',
  border: '1px solid #334155', borderRadius: 6,
  padding: '6px 12px', fontSize: 12,
  textDecoration: 'none',
}

const btnPrimary: React.CSSProperties = {
  background: '#10b981', color: '#022c22',
  border: 'none', borderRadius: 6,
  padding: '6px 14px', fontSize: 12, fontWeight: 700,
  cursor: 'pointer',
}
