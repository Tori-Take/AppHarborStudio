'use client'

import { useEffect, useState } from 'react'

type Phase = 'local' | 'deploy' | 'unknown'

type PhaseInfo = {
  key:    Phase
  label:  string
  short:  string
  icon:   string
  color:  string
  bg:     string
  border: string
  detail: string
}

const PHASES: Record<Phase, PhaseInfo> = {
  local: {
    key:    'local',
    label:  'Phase 1 · ローカル開発',
    short:  'Phase 1',
    icon:   '🛠',
    color:  '#60a5fa',
    bg:     'rgba(59, 130, 246, 0.10)',
    border: 'rgba(59, 130, 246, 0.35)',
    detail: 'DB: PGlite (.studio-db/pgdata)\nホスト: localhost\n認証: Cookie のモックユーザー\n可視: 自分だけ',
  },
  deploy: {
    key:    'deploy',
    label:  'Phase 2 · Studio Deploy',
    short:  'Phase 2',
    icon:   '🎬',
    color:  '#fbbf24',
    bg:     'rgba(251, 191, 36, 0.10)',
    border: 'rgba(251, 191, 36, 0.35)',
    detail: 'DB: Supabase studio スキーマ\nホスト: Vercel\n認証: Cookie のモックユーザー（共有）\n可視: Studio 利用者全員',
  },
  unknown: {
    key:    'unknown',
    label:  '環境不明',
    short:  'Unknown',
    icon:   '❓',
    color:  '#94a3b8',
    bg:     'rgba(148, 163, 184, 0.10)',
    border: 'rgba(148, 163, 184, 0.35)',
    detail: '環境を判定できません',
  },
}

function detectPhase(): Phase {
  if (typeof window === 'undefined') return 'unknown'
  const h = window.location.hostname
  if (h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.') || h.endsWith('.local')) {
    return 'local'
  }
  if (h.includes('vercel.app') || h.includes('appharbor.app') || h.includes('appharbor.com')) {
    return 'deploy'
  }
  return 'unknown'
}

/**
 * 現在のホスト環境（Phase 1 ローカル / Phase 2 デプロイ）を判別して
 * ヘッダ右側にバッジ表示する。ホバーで詳細ポップオーバー。
 */
export function PhaseIndicator() {
  const [phase, setPhase] = useState<Phase>('unknown')
  const [hover, setHover] = useState(false)

  useEffect(() => {
    setPhase(detectPhase())
  }, [])

  const p = PHASES[phase]

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: p.bg,
        border: `1px solid ${p.border}`,
        color: p.color,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        cursor: 'default',
        userSelect: 'none',
      }}
      title={p.label}
    >
      <span style={{ fontSize: 12 }}>{p.icon}</span>
      <span>{p.short}</span>

      {hover && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 100,
            minWidth: 240,
            padding: 12,
            borderRadius: 8,
            background: '#0f172a',
            border: `1px solid ${p.border}`,
            color: '#e2e8f0',
            fontSize: 11,
            fontWeight: 400,
            lineHeight: 1.7,
            whiteSpace: 'pre-line',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ color: p.color, fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
            {p.icon} {p.label}
          </div>
          <div style={{ color: '#94a3b8' }}>{p.detail}</div>
        </div>
      )}
    </div>
  )
}
