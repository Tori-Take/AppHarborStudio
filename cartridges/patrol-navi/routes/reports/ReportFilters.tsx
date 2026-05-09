'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../_ui/button'
import { Input }  from '../_ui/input'
import { Label }  from '../_ui/label'

type Props = {
  defaultFrom: string
  defaultTo:   string
}

export function ReportFilters({ defaultFrom, defaultTo }: Props) {
  const router = useRouter()
  const [from, setFrom] = useState(defaultFrom)
  const [to,   setTo]   = useState(defaultTo)

  function apply() {
    const sp = new URLSearchParams()
    if (from) sp.set('from', from)
    if (to)   sp.set('to',   to)
    router.push(`?${sp.toString()}`)
  }

  function preset(days: number) {
    const t = new Date()
    const f = new Date()
    f.setDate(f.getDate() - days)
    setFrom(f.toISOString().slice(0, 10))
    setTo(t.toISOString().slice(0, 10))
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs">開始日</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs">終了日</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => preset(30)}>直近 30 日</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => preset(90)}>直近 90 日</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => preset(365)}>直近 1 年</Button>
        <div className="ml-auto">
          <Button type="button" size="sm" onClick={apply}>期間を反映</Button>
        </div>
      </div>
    </div>
  )
}
