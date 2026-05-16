'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ResetOnboardingButton({ appId }: { appId: string }) {
  const router = useRouter()
  const key = `onboarding-dismissed:${appId}`
  const isDismissed = typeof window !== 'undefined' && localStorage.getItem(key) === '1'
  const [done, setDone] = useState(false)

  const handleReset = () => {
    localStorage.removeItem(key)
    setDone(true)
    setTimeout(() => router.push(`/cartridge/${encodeURIComponent(appId)}`), 1000)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleReset}
      disabled={!isDismissed || done}
      className="gap-1.5"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
      {done ? '再表示しました' : isDismissed ? 'ガイドを再表示する' : '表示中'}
    </Button>
  )
}
