'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Play, X } from 'lucide-react'
import { updateCorrectiveStatus } from './actions'
import type { CorrectiveActionStatus } from '../_types'

type Props = {
  slug:     string
  actionId: string
  status:   CorrectiveActionStatus
}

export function CompleteButton({ slug, actionId, status }: Props) {
  const [open,    setOpen]    = useState(false)
  const [note,    setNote]    = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [pending, start]      = useTransition()

  const update = (next: CorrectiveActionStatus) => {
    setError(null)
    start(async () => {
      const r = await updateCorrectiveStatus(slug, actionId, next, note || undefined)
      if (r.error) setError(r.error)
      else { setOpen(false); setNote('') }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {status === 'open' && (
          <button
            type="button" disabled={pending}
            onClick={() => update('in_progress')}
            className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            <Play className="h-3 w-3" />対応開始
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <Check className="h-3 w-3" />完了報告
        </button>
        <button
          type="button" disabled={pending}
          onClick={() => { if (confirm('このアクションを取消しますか？')) update('cancelled') }}
          className="inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <X className="h-3 w-3" />取消
        </button>
      </div>

      {open && (
        <div className="space-y-2 rounded border bg-muted/20 p-2">
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="対応内容のメモ（任意）"
            rows={2}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button" disabled={pending}
              onClick={() => update('completed')}
              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              完了する
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
