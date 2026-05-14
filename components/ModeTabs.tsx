'use client'

import { useEffect, useState } from 'react'
import { Wrench, Clapperboard, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Mode = 'develop' | 'preview' | 'release'

type ModeInfo = {
  key:   Mode
  Icon:  typeof Wrench
  label: string
  desc:  string
  /** active 時のテキスト色 */
  activeText: string
}

const MODES: ModeInfo[] = [
  {
    key:        'develop',
    Icon:       Wrench,
    label:      '開発',
    desc:       'Phase 1 — ローカル編集・動作確認',
    activeText: 'text-blue-700 dark:text-blue-400',
  },
  {
    key:        'preview',
    Icon:       Clapperboard,
    label:      'プレビュー',
    desc:       'Phase 2 — 共有デモ・クライアントレビュー',
    activeText: 'text-amber-700 dark:text-amber-400',
  },
  {
    key:        'release',
    Icon:       Rocket,
    label:      'リリース',
    desc:       'Phase 3 — AppHarbor 本番への昇格',
    activeText: 'text-emerald-700 dark:text-emerald-400',
  },
]

const STORAGE_KEY = (appId: string) => `appharbor_studio_mode_${appId}`

/**
 * カートリッジ詳細ページで「今どの作業をするか」を選ぶタブ。
 *
 * - 開発:    Phase 1 操作 (編集・Studio で起動)
 * - プレビュー: Phase 2 操作 (push 後の確認)
 * - リリース:  Phase 3 操作 (本番反映)
 *
 * 選択は localStorage に保持し、ページ再訪時に復元する。
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
    <div className="mb-4">
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1" role="tablist">
        {MODES.map((m) => {
          const active = m.key === mode
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleSelect(m.key)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? cn('bg-background shadow-sm font-semibold', m.activeText)
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/60 font-medium',
              )}
            >
              <m.Icon className="h-3.5 w-3.5" />
              <span>{m.label}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-2 px-1 text-xs text-muted-foreground">
        {current.desc}
      </p>
    </div>
  )
}
