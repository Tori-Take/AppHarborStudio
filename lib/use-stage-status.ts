'use client'

import { useEffect, useState, useCallback } from 'react'

export type StageNum = 1 | 2 | 3 | 4 | 5

export type StageStatus = {
  completed: boolean
  completedAt: string | null
  lastError: string | null
}

export type StageMap = Record<StageNum, StageStatus>

const KEY_PREFIX = 'stage-status:'
const CHANGE_EVENT = 'stage-status-changed'

function emptyMap(): StageMap {
  const empty = (): StageStatus => ({ completed: false, completedAt: null, lastError: null })
  return { 1: empty(), 2: empty(), 3: empty(), 4: empty(), 5: empty() }
}

function readStorage(appId: string): StageMap {
  if (typeof window === 'undefined') return emptyMap()
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${appId}`)
    if (!raw) {
      const m = emptyMap()
      m[1] = { completed: true, completedAt: new Date().toISOString(), lastError: null }
      return m
    }
    const parsed = JSON.parse(raw) as Partial<StageMap>
    const base = emptyMap()
    base[1] = { completed: true, completedAt: new Date().toISOString(), lastError: null }
    return { ...base, ...parsed } as StageMap
  } catch {
    return emptyMap()
  }
}

function writeStorage(appId: string, map: StageMap) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${KEY_PREFIX}${appId}`, JSON.stringify(map))
  // 同一タブ内の他のフック利用者に通知
  // (storage イベントは別タブにしか飛ばないので CustomEvent を使う)
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { appId } }))
}

export function useStageStatus(appId: string) {
  const [stages, setStages] = useState<StageMap>(emptyMap)

  useEffect(() => {
    // 初回 (localStorage 未初期化) はサーバーから実態を自動検出して初期値に
    const key = `${KEY_PREFIX}${appId}`
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null
    if (raw === null && typeof window !== 'undefined') {
      fetch(`/api/cartridges/${encodeURIComponent(appId)}/stage-status`)
        .then(r => r.ok ? r.json() : null)
        .then((j: { auto: Record<string, boolean> } | null) => {
          if (!j?.auto) {
            setStages(readStorage(appId))
            return
          }
          const next = emptyMap()
          const now = new Date().toISOString()
          for (const s of [1, 2, 3, 4, 5] as StageNum[]) {
            if (j.auto[String(s)]) {
              next[s] = { completed: true, completedAt: now, lastError: null }
            }
          }
          writeStorage(appId, next)
          setStages(next)
        })
        .catch(() => setStages(readStorage(appId)))
    } else {
      setStages(readStorage(appId))
    }

    // 別のコンポーネントが書き換えた時に同期
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ appId: string }>).detail
      if (detail?.appId === appId) {
        setStages(readStorage(appId))
      }
    }
    window.addEventListener(CHANGE_EVENT, handler)
    return () => window.removeEventListener(CHANGE_EVENT, handler)
  }, [appId])

  const markCompleted = useCallback((stage: StageNum) => {
    setStages(prev => {
      const next = { ...prev, [stage]: { completed: true, completedAt: new Date().toISOString(), lastError: null } }
      writeStorage(appId, next)
      return next
    })
  }, [appId])

  const markError = useCallback((stage: StageNum, error: string) => {
    setStages(prev => {
      const next = { ...prev, [stage]: { ...prev[stage], lastError: error } }
      writeStorage(appId, next)
      return next
    })
  }, [appId])

  const resetStage = useCallback((stage: StageNum) => {
    setStages(prev => {
      const next = { ...prev, [stage]: { completed: false, completedAt: null, lastError: null } }
      writeStorage(appId, next)
      return next
    })
  }, [appId])

  /** 指定 stage 以降を全て未完了に戻す (パイプライン上のロールバック) */
  const rollbackTo = useCallback((stage: StageNum) => {
    setStages(prev => {
      const next: StageMap = { ...prev }
      for (let s = stage; s <= 5; s++) {
        next[s as StageNum] = { completed: false, completedAt: null, lastError: null }
      }
      writeStorage(appId, next)
      return next
    })
  }, [appId])

  const currentStage: StageNum = (() => {
    for (let s = 5; s >= 1; s--) {
      if (stages[s as StageNum].completed) {
        return Math.min(s + 1, 5) as StageNum
      }
    }
    return 1
  })()

  return { stages, currentStage, markCompleted, markError, resetStage, rollbackTo }
}
