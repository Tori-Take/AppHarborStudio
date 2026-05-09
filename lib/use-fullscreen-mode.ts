'use client'

import { useEffect, useState } from 'react'

/**
 * 全画面表示モードのフック。
 *
 * sessionStorage に保存することで、ページ遷移後も状態を維持する。
 * URL クエリだとリンク遷移時に失われるため不採用。
 *
 * 同一タブ内で複数コンポーネント間の同期は CustomEvent 経由。
 */
const STORAGE_KEY = 'studio-fullscreen-mode'
const EVENT_NAME  = 'studio-fullscreen-changed'

function readEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try { return sessionStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

export function useFullscreenMode(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState(false)

  // SSR ハイドレーション対策: 初期値は false で固定し、mount 後に sessionStorage を読む
  useEffect(() => {
    setEnabled(readEnabled())
    const handler = () => setEnabled(readEnabled())
    window.addEventListener(EVENT_NAME, handler)
    return () => window.removeEventListener(EVENT_NAME, handler)
  }, [])

  const set = (value: boolean) => {
    try {
      if (value) sessionStorage.setItem(STORAGE_KEY, '1')
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
    setEnabled(value)
    window.dispatchEvent(new Event(EVENT_NAME))
  }

  return [enabled, set]
}
