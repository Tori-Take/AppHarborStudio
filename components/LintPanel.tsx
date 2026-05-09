'use client'

import { useEffect, useState } from 'react'
import { buildAiFixPrompt, type LintIssue } from '@/lib/ai-fix-prompt'

export function LintPanel({ appId }: { appId: string }) {
  const [data, setData] = useState<{ issues: LintIssue[]; filesScanned: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/lint`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [appId])

  if (loading) return <div style={{ ...panelStyle, fontSize: 13, color: '#94a3b8' }}>規約チェック中...</div>
  if (!data) return null

  const errors = data.issues.filter((i) => i.severity === 'error')
  const warns  = data.issues.filter((i) => i.severity === 'warn')

  const borderColor = errors.length > 0 ? '#ef4444' : warns.length > 0 ? '#fbbf24' : '#10b981'

  return (
    <section style={{ ...panelStyle, borderColor }}>
      <div style={{ ...labelStyle, color: borderColor }}>
        🔎 規約チェック （{data.filesScanned} ファイル走査）
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 13, marginTop: 4 }}>
        <span style={{ color: errors.length > 0 ? '#ef4444' : '#64748b' }}>
          ❌ エラー: {errors.length}
        </span>
        <span style={{ color: warns.length > 0 ? '#fbbf24' : '#64748b' }}>
          ⚠ 警告: {warns.length}
        </span>
        {errors.length === 0 && warns.length === 0 && (
          <span style={{ color: '#10b981' }}>✓ 規約準拠</span>
        )}
      </div>

      {/* AI 修正プロンプトのコピー（違反がある時） */}
      {data.issues.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            🤖 AI に修正依頼:
          </span>
          <button
            onClick={async () => {
              const prompt = buildAiFixPrompt(appId, data.issues)
              try {
                await navigator.clipboard.writeText(prompt)
                setCopied(true)
                setTimeout(() => setCopied(false), 2500)
              } catch {
                alert('クリップボードにコピーできませんでした')
              }
            }}
            style={{
              padding: '6px 12px',
              background: '#a78bfa',
              color: '#1f2937',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ コピーしました' : '📋 修正プロンプトをコピー'}
          </button>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Claude Code に貼り付けて使ってください
          </span>
        </div>
      )}

      {data.issues.length > 0 && (
        <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: 'none', fontSize: 12 }}>
          {data.issues.map((i, idx) => (
            <li
              key={idx}
              style={{
                padding: '6px 8px', marginBottom: 4,
                background: i.severity === 'error' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(251, 191, 36, 0.08)',
                borderLeft: `3px solid ${i.severity === 'error' ? '#ef4444' : '#fbbf24'}`,
                borderRadius: 4,
              }}
            >
              <div style={{ color: '#e2e8f0', fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' }}>
                {i.file}:{i.line}
              </div>
              <div style={{ color: '#94a3b8', marginTop: 2 }}>{i.message}</div>
              <code style={{ color: '#fbbf24', fontSize: 11 }}>{i.spec}</code>
            </li>
          ))}
        </ul>
      )}
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
