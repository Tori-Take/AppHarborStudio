'use client'

import { useEffect, useState, type ReactNode } from 'react'

type Step = 1 | 2 | 3

const STORAGE_KEY = (appId: string) => `appharbor_studio_step_${appId}`

const STEPS: { id: Step; label: string; sub: string }[] = [
  { id: 1, label: 'アプリ情報',     sub: '名前・識別子・説明' },
  { id: 2, label: 'AI と開発',     sub: 'Claude Code に依頼' },
  { id: 3, label: '動作確認・公開', sub: 'プレイ・push・配布' },
]

const NEXT_BTN_LABEL: Record<Step, string | null> = {
  1: '✓ 開発に進む',
  2: '✓ 開発完了、動作確認へ',
  3: null,
}

type Props = {
  appId: string
  /** Step ① に表示するパネル群（アプリ情報） */
  step1: ReactNode
  /** Step ② に表示するパネル群（AI と開発） */
  step2: ReactNode
  /** Step ③ に表示するパネル群（動作確認・公開） */
  step3: ReactNode
  /** localStorage 未保存時の初期 step（既存カートリッジは ② から始める想定） */
  initialStep?: Step
}

export function CartridgeStepper({ appId, step1, step2, step3, initialStep = 1 }: Props) {
  const [step, setStep]  = useState<Step>(initialStep)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(appId))
      if (saved) {
        const n = Number(saved)
        if (n === 1 || n === 2 || n === 3) setStep(n)
      } else {
        setStep(initialStep)
      }
    } catch { /* ignore */ }
    setReady(true)
  }, [appId, initialStep])

  const goTo = (next: Step) => {
    setStep(next)
    try { localStorage.setItem(STORAGE_KEY(appId), String(next)) } catch { /* ignore */ }
  }

  // 初期化前は何も描画しない（localStorage 復元前のチラつきを避ける）
  if (!ready) return null

  return (
    <>
      <Stepper current={step} onJump={goTo} />

      {step === 1 && step1}
      {step === 2 && step2}
      {step === 3 && step3}

      <div style={{
        display: 'flex', gap: 8, justifyContent: 'space-between',
        marginTop: 16, flexWrap: 'wrap',
      }}>
        {step > 1 ? (
          <button onClick={() => goTo((step - 1) as Step)} style={btnGhost}>
            ← 前のステップへ
          </button>
        ) : <span />}

        {NEXT_BTN_LABEL[step] && (
          <button onClick={() => goTo((step + 1) as Step)} style={btnPrimary}>
            {NEXT_BTN_LABEL[step]}
          </button>
        )}
      </div>
    </>
  )
}

function Stepper({ current, onJump }: { current: Step; onJump: (s: Step) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0,
      marginBottom: 20, marginTop: 4,
      background: '#0f172a', border: '1px solid #334155',
      borderRadius: 8, padding: 6,
    }}>
      {STEPS.map((s, i) => {
        const active   = current === s.id
        const done     = current > s.id
        const upcoming = current < s.id

        return (
          <div key={s.id} style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
            <button
              onClick={() => !upcoming && onJump(s.id)}
              disabled={upcoming}
              title={upcoming ? '前のステップを完了すると進めます' : `Step ${s.id}: ${s.label}`}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                border: 'none', borderRadius: 6,
                background: active ? '#1e293b' : 'transparent',
                color: active ? '#fbbf24' : done ? '#10b981' : '#64748b',
                cursor: upcoming ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: upcoming ? 0.5 : 1,
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: '50%',
                background: active ? '#fbbf24' : done ? '#10b981' : '#334155',
                color: active || done ? '#0f172a' : '#94a3b8',
                fontSize: 12, fontWeight: 700,
              }}>
                {done ? '✓' : s.id}
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>{s.sub}</span>
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span style={{
                width: 16, height: 1,
                background: done ? '#10b981' : '#334155',
                margin: '0 4px',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  background: '#fbbf24', color: '#1f2937',
  border: 'none', borderRadius: 6, padding: '8px 16px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8',
  border: '1px solid #334155', borderRadius: 6, padding: '8px 14px',
  fontSize: 13, cursor: 'pointer',
}
