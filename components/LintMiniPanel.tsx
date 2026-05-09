'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { buildAiFixPrompt, type LintIssue } from '@/lib/ai-fix-prompt'

type LintResult = {
  issues:       LintIssue[]
  filesScanned: number
}

/**
 * プレイ画面の右パネルに表示する、コンパクトな規約チェックパネル。
 *
 * - 緑/黄/赤バッジで状態を一目で表示
 * - クリックで違反詳細を展開
 * - 詳細ページへのリンクも併記
 */
export function LintMiniPanel() {
  const pathname = usePathname() ?? ''
  const m = pathname.match(/^\/org\/([^/]+)\/apps\/([^/?]+)/)
  const cartridgeId = m?.[2]

  const [data, setData]       = useState<LintResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    if (!cartridgeId) { setData(null); return }
    setLoading(true)
    fetch(`/api/cartridges/${encodeURIComponent(cartridgeId)}/lint`)
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false))
  }, [cartridgeId])

  if (!cartridgeId) return null

  const errors = data?.issues.filter((i) => i.severity === 'error') ?? []
  const warns  = data?.issues.filter((i) => i.severity === 'warn')  ?? []

  const status: 'ok' | 'warn' | 'error' | 'loading' =
    loading ? 'loading'
    : errors.length > 0 ? 'error'
    : warns.length > 0 ? 'warn'
    : 'ok'

  const VARIANT = {
    ok:      { color: '#10b981', icon: '✓', label: '規約準拠' },
    warn:    { color: '#fbbf24', icon: '⚠', label: '警告あり' },
    error:   { color: '#ef4444', icon: '✗', label: '違反あり' },
    loading: { color: '#94a3b8', icon: '…', label: 'チェック中' },
  }
  const v = VARIANT[status]

  const summary = data
    ? (errors.length === 0 && warns.length === 0)
      ? `${data.filesScanned} ファイル走査・違反なし`
      : `エラー ${errors.length} / 警告 ${warns.length}`
    : '読込中…'

  return (
    <section style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #334155' }}>
      <h3 style={{
        margin: '0 0 6px',
        fontSize: 11,
        color: v.color,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: 600,
      }}>
        🔎 規約チェック
      </h3>

      <button
        onClick={() => setExpanded(!expanded)}
        disabled={loading || !data || data.issues.length === 0}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          background: status === 'ok' ? 'rgba(16, 185, 129, 0.08)'
                    : status === 'warn' ? 'rgba(251, 191, 36, 0.08)'
                    : status === 'error' ? 'rgba(239, 68, 68, 0.08)'
                    : 'rgba(148, 163, 184, 0.08)',
          border: `1px solid ${v.color}`,
          borderRadius: 6,
          color: v.color,
          fontSize: 12,
          fontWeight: 600,
          cursor: (data && data.issues.length > 0) ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 14 }}>{v.icon}</span>
        <span style={{ flex: 1 }}>{v.label}</span>
        {data && data.issues.length > 0 && (
          <span style={{ fontSize: 10, opacity: 0.8 }}>{expanded ? '▲' : '▼'}</span>
        )}
      </button>

      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
        {summary}
      </div>

      {/* AI 修正プロンプトのコピーボタン（違反がある時のみ表示） */}
      {data && data.issues.length > 0 && (
        <button
          onClick={async () => {
            const prompt = buildAiFixPrompt(cartridgeId!, data.issues)
            try {
              await navigator.clipboard.writeText(prompt)
              setCopied(true)
              setTimeout(() => setCopied(false), 2500)
            } catch {
              alert('クリップボードにコピーできませんでした')
            }
          }}
          style={{
            marginTop: 6,
            width: '100%',
            padding: '5px 8px',
            background: '#a78bfa',
            color: '#1f2937',
            border: 'none',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center',
          }}
          title="この内容と AppHarbor 規約をまとめた修正用プロンプトをコピー。Claude Code に貼り付けて使う"
        >
          {copied ? '✓ コピーしました' : '📋 AI 修正プロンプトをコピー'}
        </button>
      )}

      {expanded && data && data.issues.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none' }}>
          {data.issues.slice(0, 5).map((i, idx) => (
            <li
              key={idx}
              style={{
                fontSize: 10,
                padding: '4px 6px',
                marginBottom: 3,
                background: i.severity === 'error' ? 'rgba(239, 68, 68, 0.06)' : 'rgba(251, 191, 36, 0.06)',
                borderLeft: `2px solid ${i.severity === 'error' ? '#ef4444' : '#fbbf24'}`,
                borderRadius: 3,
                color: '#cbd5e1',
              }}
            >
              <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', color: '#e2e8f0' }}>
                {i.file}:{i.line}
              </div>
              <div style={{ marginTop: 1, opacity: 0.85 }}>{i.message}</div>
            </li>
          ))}
          {data.issues.length > 5 && (
            <li style={{ fontSize: 10, color: '#64748b', padding: '4px 6px', fontStyle: 'italic' }}>
              他 {data.issues.length - 5} 件…
            </li>
          )}
        </ul>
      )}

      <Link
        href={`/cartridge/${encodeURIComponent(cartridgeId)}`}
        style={{
          display: 'inline-block',
          marginTop: 6,
          fontSize: 10,
          color: '#64748b',
          textDecoration: 'underline',
        }}
      >
        詳細ページで確認 →
      </Link>
    </section>
  )
}


