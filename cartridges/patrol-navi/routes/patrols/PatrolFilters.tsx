'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition, useEffect } from 'react'
import { Search, X, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { SHEET_STATUS_LABEL, type PatrolSheetStatus } from '../_types'

type Patroller = { id: string; display_name: string }

type Props = {
  patrollers: Patroller[]
}

export function PatrolFilters({ patrollers }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [from, setFrom] = useState(searchParams.get('from') ?? '')
  const [to,   setTo]   = useState(searchParams.get('to')   ?? '')
  const [site, setSite] = useState(searchParams.get('site') ?? '')
  const [patroller, setPatroller] = useState(searchParams.get('patroller') ?? '')
  const [status,    setStatus]    = useState(searchParams.get('status')    ?? '')
  const [ng,        setNg]        = useState(searchParams.get('ng') === '1')

  // URL → state 同期（戻るボタン対応）
  useEffect(() => {
    setFrom(searchParams.get('from') ?? '')
    setTo(searchParams.get('to') ?? '')
    setSite(searchParams.get('site') ?? '')
    setPatroller(searchParams.get('patroller') ?? '')
    setStatus(searchParams.get('status') ?? '')
    setNg(searchParams.get('ng') === '1')
  }, [searchParams])

  const apply = () => {
    const params = new URLSearchParams(searchParams)
    const setOrDel = (key: string, val: string) => {
      if (val) params.set(key, val); else params.delete(key)
    }
    setOrDel('from', from)
    setOrDel('to', to)
    setOrDel('site', site.trim())
    setOrDel('patroller', patroller)
    setOrDel('status', status)
    setOrDel('ng', ng ? '1' : '')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const reset = () => {
    setFrom(''); setTo(''); setSite(''); setPatroller(''); setStatus(''); setNg(false)
    const params = new URLSearchParams()
    const tab = searchParams.get('tab')
    if (tab) params.set('tab', tab)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const hasFilter = !!(from || to || site || patroller || status || ng)
  // フィルタが何か設定されていれば初期展開、なければ畳む
  const [open, setOpen] = useState(hasFilter)

  // 適用済みフィルタの件数（バッジ表示用）
  const activeCount = [from, to, site, patroller, status, ng ? '1' : ''].filter(Boolean).length

  return (
    <div className="mb-4 rounded-lg border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          絞り込み
          {activeCount > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
      <div className="border-t p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
        <div className="md:col-span-3">
          <label className="mb-1 block text-[11px] text-muted-foreground">期間</label>
          <div className="flex items-center gap-1">
            <input
              type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
            />
            <span className="text-xs text-muted-foreground">〜</span>
            <input
              type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
            />
          </div>
        </div>

        <div className="md:col-span-3">
          <label className="mb-1 block text-[11px] text-muted-foreground">現場名</label>
          <input
            type="text" value={site} onChange={e => setSite(e.target.value)}
            placeholder="部分一致"
            onKeyDown={e => { if (e.key === 'Enter') apply() }}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-[11px] text-muted-foreground">パトロール者</label>
          <select
            value={patroller} onChange={e => setPatroller(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">全員</option>
            {patrollers.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-[11px] text-muted-foreground">ステータス</label>
          <select
            value={status} onChange={e => setStatus(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">すべて</option>
            {(['draft', 'in_progress', 'completed', 'remanded'] as PatrolSheetStatus[]).map(s => (
              <option key={s} value={s}>{SHEET_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2 md:col-span-2">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox" checked={ng} onChange={e => setNg(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            NG あり
          </label>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        {hasFilter && (
          <button
            type="button" onClick={reset} disabled={isPending}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> クリア
          </button>
        )}
        <button
          type="button" onClick={apply} disabled={isPending}
          className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Search className="h-3 w-3" />
          {isPending ? '...' : '絞り込み'}
        </button>
      </div>
      </div>
      )}
    </div>
  )
}
