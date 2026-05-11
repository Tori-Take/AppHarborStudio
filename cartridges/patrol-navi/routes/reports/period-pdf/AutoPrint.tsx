'use client'

import { useEffect, useState } from 'react'
import { Printer, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type Props = { backHref: string; autoPrint?: boolean }

export function AutoPrint({ backHref, autoPrint }: Props) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!autoPrint) return
    const imgs = Array.from(document.images)
    const pending = imgs.filter(img => !img.complete)
    if (pending.length === 0) {
      setReady(true)
      return
    }
    let remain = pending.length
    const done = () => { remain--; if (remain <= 0) setReady(true) }
    for (const img of pending) {
      img.addEventListener('load',  done, { once: true })
      img.addEventListener('error', done, { once: true })
    }
  }, [autoPrint])

  useEffect(() => {
    if (ready) setTimeout(() => window.print(), 200)
  }, [ready])

  return (
    <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-3">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        集計出力に戻る
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Printer className="h-4 w-4" />
        印刷 / PDF 保存
      </button>
    </div>
  )
}
