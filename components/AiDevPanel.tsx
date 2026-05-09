'use client'

import { useEffect, useState } from 'react'

export function AiDevPanel({ appId, path }: { appId: string; path: string }) {
  const [copied, setCopied] = useState<'path' | 'cmd' | null>(null)
  const [hasClaudeMd, setHasClaudeMd] = useState<boolean | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/claude-md`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => setHasClaudeMd(j?.exists ?? false))
      .catch(() => setHasClaudeMd(false))
  }, [appId])

  const generateClaudeMd = async () => {
    setGenerating(true)
    const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/claude-md`, { method: 'POST' })
    setGenerating(false)
    if (res.ok) setHasClaudeMd(true)
    else alert('CLAUDE.md の生成に失敗しました')
  }

  const copyToClipboard = async (text: string, kind: 'path' | 'cmd') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      alert('クリップボードにコピーできませんでした')
    }
  }

  const openInExplorer = async () => {
    const res = await fetch('/api/fs/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error ?? 'フォルダを開けませんでした')
    }
  }

  return (
    <section style={panelStyle}>
      <div style={{ ...labelStyle, color: '#a78bfa' }}>🤖 AI で開発する</div>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 12px' }}>
        Claude Code でこのフォルダを開いて開発を始めます。フォルダ内に <code>CLAUDE.md</code> があるので、AI に文脈が伝わります。
      </p>

      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>カートリッジパス</div>
        <code style={{ fontSize: 12, color: '#fbbf24', wordBreak: 'break-all', display: 'block' }}>{path}</code>
      </div>

      {hasClaudeMd === false && (
        <div style={{
          background: 'rgba(251, 191, 36, 0.08)', border: '1px solid #fbbf24',
          borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 12, color: '#fbbf24',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span>⚠ CLAUDE.md がありません — AI に文脈を渡せません</span>
          <button onClick={generateClaudeMd} disabled={generating} style={{
            background: '#fbbf24', color: '#1f2937', border: 'none',
            borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {generating ? '生成中...' : '生成する'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => copyToClipboard(path, 'path')} style={btnPrimary}>
          {copied === 'path' ? '✓ コピーしました' : '📋 パスをコピー'}
        </button>
        <button onClick={openInExplorer} style={btnGhost}>
          📂 エクスプローラーで開く
        </button>
        <button onClick={() => copyToClipboard(`cd "${path}" && claude`, 'cmd')} style={btnGhost}>
          {copied === 'cmd' ? '✓ コピーしました' : '⌨ Claude Code 起動コマンド'}
        </button>
      </div>

      <details style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
        <summary style={{ cursor: 'pointer', userSelect: 'none' }}>使い方の手順</summary>
        <ol style={{ paddingLeft: 20, marginTop: 8, lineHeight: 1.8 }}>
          <li>「📂 エクスプローラーで開く」でフォルダを表示</li>
          <li>Claude Desktop アプリを起動して、このフォルダをドラッグ&ドロップ または開く</li>
          <li>または: ターミナルで「⌨ Claude Code 起動コマンド」をコピペ実行</li>
          <li>AI と対話しながらカートリッジを開発</li>
          <li>このページに戻って「Studio で起動」で動作確認</li>
        </ol>
      </details>
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
  background: '#a78bfa', color: '#1f2937',
  border: 'none', borderRadius: 6, padding: '6px 14px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8',
  border: '1px solid #334155', borderRadius: 6, padding: '6px 14px',
  fontSize: 13, cursor: 'pointer',
}
