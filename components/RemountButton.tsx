'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function RemountButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const remount = async () => {
    setBusy(true); setDone(false)
    try {
      const res = await fetch('/api/mount', { method: 'POST' })
      if (!res.ok) throw new Error('mount failed')
      setDone(true)
      router.refresh()
      setTimeout(() => setDone(false), 1500)
    } catch {
      alert('再マウントに失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      onClick={remount}
      disabled={busy}
      variant="outline"
      size="sm"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />}
      {busy ? 'マウント中...' : done ? '完了' : '再マウント'}
    </Button>
  )
}
