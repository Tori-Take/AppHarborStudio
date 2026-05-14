'use client'

import { useEffect, useState } from 'react'

export type Mode = 'develop' | 'preview' | 'release'

type ModeInfo = {
  key:   Mode
  icon:  string
  label: string
  desc:  string
  color: string
}

const MODES: ModeInfo[] = [
  {
    key:   'develop',
    icon:  '🛠',
    label: '開発',
    desc:  'Phase 1 — ローカル編集・動作確認',
    color: '#60a5fa',
  },
  {
    key:   'preview',
    icon:  '🎬',
    label: 'プレビュー',
    desc:  'Phase 2 — 共有デモ・クライアントレビュー',
    color: '#fbbf24',
  },
  {
    key:   'release',
    icon:  '🚀',
    label: 'リリース',
    desc:  'Phase 3 — AppHarbor 本番への昇格',
    color: '#34d399',
  },
]

const STORAGE_KEY = (appId: string) => `appharbor_studio_mode_${appId}`

/**
 * カートリッジ詳細ページで「今どの作業をするか」を選ぶタブ。
 *
 * - 開発:    Phase 1 操作（編集・Studio で起動）
 * - プレビュー: Phase 2 操作（push 後の確認）
 * - リリース:  Phase 3 操作（本番反映、Admin 向け）
 *
 * 選択は localStorage に保持し、ページ再訪時に復元する。
 * `onChange` で親に通知して各セクションの表示を切り替える。
 */
export function ModeTabs({
  appId,
  onChange,
  defaultMode = 'develop',
}: {
  appId:        string
  onChange?:    (mode: Mode) => void
  defaultMode?: Mode
}) {
  const [mode, setMode] = useState<Mode>(defaultMode)

  // localStorage から復元
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY(appId))
      if (v === 'develop' || v === 'preview' || v === 'release') {
        setMode(v)
        onChange?.(v)
      } else {
        onChange?.(defaultMode)
      }
    } catch {
      onChange?.(defaultMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId])

  const handleSelect = (m: Mode) => {
    setMode(m)
    try { localStorage.setItem(STORAGE_KEY(appId), m) } catch { /* */ }
    onChange?.(m)
  }

  const current = MODES.find((m) => m.key === mode) ?? MODES[0]

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 8,
      }}>
        {MODES.map((m) => {
          const active = m.key === mode
          return (
            <button
              key={m.key}
              onClick={() => handleSelect(m.key)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background:  active ? '#1e293b' : 'transparent',
                color:       active ? m.color : '#94a3b8',
                fontSize:    12,
                fontWeight:  active ? 700 : 500,
                display:     'flex',
                alignItems:  'center',
                justifyContent: 'center',
                gap: 6,
                transition:  'all 0.15s',
                boxShadow:   active ? `inset 0 0 0 1px ${m.color}40` : 'none',
              }}
            >
              <span style={{ fontSize: 14 }}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          )
        })}
      </div>

      {/* 現在モードの説明 */}
      <div style={{
        marginTop: 6,
        padding: '4px 8px',
        fontSize: 11,
        color: '#94a3b8',
      }}>
        {current.desc}
      </div>
    </div>
  )
}
