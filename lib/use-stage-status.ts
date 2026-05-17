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

export type DbSourceId = 'pglite' | 'docker' | 'studio-cloud'

export function useStageStatus(appId: string) {
  const [stages, setStages] = useState<StageMap>(emptyMap)
  const [naStages, setNaStages] = useState<Set<StageNum>>(() => new Set())
  const [unavailableSources, setUnavailableSources] = useState<Set<DbSourceId>>(() => new Set())

  useEffect(() => {
    // 初回 (localStorage 未初期化) はサーバーから実態を自動検出して初期値に
    const key = `${KEY_PREFIX}${appId}`
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null

    // env 情報 (N/A stage 等) は localStorage に依らず毎回サーバーから取得
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/stage-status`)
      .then(r => r.ok ? r.json() : null)
      .then((j: { auto?: Record<string, boolean>; naStages?: number[]; unavailableSources?: string[] } | null) => {
        const na = new Set<StageNum>()
        if (j?.naStages) {
          for (const s of j.naStages) na.add(s as StageNum)
        }
        setNaStages(na)

        const us = new Set<DbSourceId>()
        if (j?.unavailableSources) {
          for (const s of j.unavailableSources) {
            if (s === 'pglite' || s === 'docker' || s === 'studio-cloud') us.add(s)
          }
        }
        setUnavailableSources(us)

        // localStorage の有無に関わらず、N/A stage は常に completed として扱う
        // (環境上スキップ確定 = 「ローカル開発で通過」表示)
        const current = raw === null ? emptyMap() : readStorage(appId)
        const now = new Date().toISOString()
        let modified = raw === null

        for (const s of [1, 2, 3, 4, 5] as StageNum[]) {
          // N/A stage → 常に完了
          if (na.has(s) && !current[s].completed) {
            current[s] = { completed: true, completedAt: now, lastError: null }
            modified = true
          }
          // 非 N/A + 初回 + auto 完了 → 完了
          if (raw === null && !na.has(s) && j?.auto?.[String(s)] && !current[s].completed) {
            current[s] = { completed: true, completedAt: now, lastError: null }
            modified = true
          }
        }

        if (modified) writeStorage(appId, current)
        setStages(current)
      })
      .catch(() => setStages(readStorage(appId)))

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
    // N/A stage は「完了相当」として扱う (環境上スキップ確定)
    for (let s = 5; s >= 1; s--) {
      const sn = s as StageNum
      if (stages[sn].completed || naStages.has(sn)) {
        // 次の Stage を返すが、その Stage も N/A ならスキップ
        let next = Math.min(s + 1, 5) as StageNum
        while (next < 5 && naStages.has(next)) {
          next = (next + 1) as StageNum
        }
        return next
      }
    }
    return 1
  })()

  return { stages, naStages, unavailableSources, currentStage, markCompleted, markError, resetStage, rollbackTo }
}
