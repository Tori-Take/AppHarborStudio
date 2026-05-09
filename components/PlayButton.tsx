'use client'

import { useRef, useState } from 'react'

type LaunchMode = 'normal' | 'data' | 'full'

/** about:blank タブに「準備中」HTML を即時書き込む。失敗してもエラーは握りつぶす。 */
function paintLoading(w: Window | null, appId: string, mode: LaunchMode) {
  if (!w || !w.document) return
  const modeLabel =
    mode === 'data' ? '🧹 データのみリセット → '
  : mode === 'full' ? '💣 完全リセット → '
  : ''
  try {
    w.document.title = `Studio 起動中: ${appId}`
    w.document.body.style.margin = '0'
    w.document.body.innerHTML = `
      <div style="
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        min-height:100vh; background:#0b1322; color:#fbbf24;
        font-family:system-ui,-apple-system,sans-serif;
      ">
        <div style="font-size:14px; color:#94a3b8; margin-bottom:8px;">${modeLabel}Studio</div>
        <div style="font-size:24px; font-weight:600;">⏳ ${appId} を準備中…</div>
        <div style="margin-top:12px; font-size:12px; color:#64748b;">
          mount + 初回コンパイル待ち (最大 30 秒)
        </div>
      </div>
    `
  } catch { /* cross-origin 等で書込不可なら無視 */ }
}

/** dev server が応答するまで health をポーリング。失敗してもエラーにはしない。 */
async function waitForHealth(timeoutMs: number) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch('/api/studio/health', { cache: 'no-store' })
      if (r.ok) return
    } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500))
  }
}

export function PlayButton({ appId, slug = 'studio-sandbox' }: { appId: string; slug?: string }) {
  const [busy, setBusy] = useState<false | LaunchMode>(false)
  const targetName = `appharbor-studio-${appId}`
  const winRef = useRef<Window | null>(null)

  const launch = async (mode: LaunchMode) => {
    let withSample = false

    if (mode === 'data') {
      if (!confirm(
        '🧹 データのみリセット\n\n' +
        '・シート / 是正 / コメント / 履歴 を削除\n' +
        '・チェックリスト / ワークフロー / 役割 は保持\n' +
        '・クエリログをクリア\n\n' +
        '実行しますか？',
      )) return
    }
    if (mode === 'full') {
      if (!confirm(
        '💣 完全リセット\n\n' +
        '・PGlite の全テーブルを DROP\n' +
        '・db-base.sql + 全カートリッジの schema.sql 再適用\n' +
        '・30 ユーザー / 10 部署を再シード\n' +
        '・app-permissions.json を削除\n' +
        '・クエリログをクリア\n\n' +
        '※ ソースコード (cartridges/) と Git 履歴は影響なし。\n\n' +
        '実行しますか？',
      )) return
      withSample = confirm(
        '📦 サンプルマスターデータを投入しますか？\n\n' +
        '・チェックリストテンプレ 1 個 (8 項目)\n' +
        '・ワークフローテンプレ 1 個 (4 段階・並列含む)\n' +
        '・アプリ内ロール 5 個 + ユーザー紐付け\n\n' +
        '「OK」: 投入する (起動直後からシート作成可能)\n' +
        '「キャンセル」: 投入しない (空の状態で起動)',
      )
    }

    setBusy(mode)
    const url = `/org/${slug}/apps/${appId}`
    // クリックハンドラ同期で開かないとポップアップブロックされるため、
    // 先に新タブを about:blank で開く。中身は「準備中…」を即時に書込み、
    // 万一この後の処理が失敗・タイムアウトしてもタブが空白のまま放置されない。
    const w = window.open('about:blank', targetName)
    winRef.current = w
    paintLoading(w, appId, mode)

    // 全処理にタイムアウトを設けて、ハングした時もタブ遷移は必ず試みる
    const withTimeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

    try {
      if (mode === 'data') {
        await withTimeout(fetch('/api/studio/data-reset', { method: 'POST' }), 30_000)
      }
      if (mode === 'full') {
        await withTimeout(fetch('/api/studio/clean-start', { method: 'POST' }), 30_000)
        if (withSample) {
          await withTimeout(fetch('/api/studio/sample-seed', { method: 'POST' }), 15_000)
        }
      }
      await withTimeout(fetch('/api/mount', { method: 'POST' }), 15_000)
      await withTimeout(
        fetch(`/api/app-permissions/${encodeURIComponent(appId)}/init`, { method: 'POST' }),
        10_000,
      )
      // dev server が再コンパイル中の可能性があるので、URL が serve できるまで
      // health で確認 (最大 30 秒)。準備完了で navigation するため about:blank の
      // ままになるリスクが大幅に減る。
      await waitForHealth(20_000)
    } catch {
      // 失敗しても遷移は試す (起動を諦めない)
    }
    try {
      if (w && !w.closed) {
        w.location.href = url
        w.focus()
      } else {
        // ポップアップブロック時のフォールバック
        window.location.href = url
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        onClick={() => launch('normal')}
        disabled={!!busy}
        style={{
          background: busy === 'normal' ? '#94a3b8' : '#fbbf24',
          color: '#1f2937', border: 'none', borderRadius: 6,
          padding: '8px 16px', fontSize: 14, fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy === 'normal' ? '再ビルド中...' : 'Studio で起動 →'}
      </button>
      <button
        onClick={() => launch('data')}
        disabled={!!busy}
        title="シートや是正など実績データのみ削除して起動 (テンプレは残す)"
        style={{
          background: 'transparent',
          color: '#fbbf24', border: '1px solid #fbbf24',
          borderRadius: 6, padding: '8px 14px',
          fontSize: 13, fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy === 'data' ? 'リセット中...' : '🧹 データのみリセット'}
      </button>
      <button
        onClick={() => launch('full')}
        disabled={!!busy}
        title="DB を完全初期化 (テンプレも削除・スキーマ再適用・30 ユーザー再シード)"
        style={{
          background: 'transparent',
          color: '#fca5a5', border: '1px solid #ef4444',
          borderRadius: 6, padding: '8px 14px',
          fontSize: 13, fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy === 'full' ? 'リセット中...' : '💣 完全リセット'}
      </button>
    </div>
  )
}
