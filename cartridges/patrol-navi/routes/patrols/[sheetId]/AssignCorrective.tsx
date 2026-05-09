'use client'

import { useState, useTransition } from 'react'
import { ClipboardCheck, Loader2 } from 'lucide-react'
import { createCorrectiveAction } from '../../correctives/actions'

type Member = { id: string; display_name: string }

type Props = {
  slug:        string
  sheetItemId: string
  members:     Member[]
}

export function AssignCorrective({ slug, sheetItemId, members }: Props) {
  const [open,    setOpen]    = useState(false)
  const [assignee, setAssignee] = useState('')
  const [due,     setDue]     = useState('')
  const [comment, setComment] = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [done,    setDone]    = useState(false)
  const [pending, start]      = useTransition()

  const submit = () => {
    if (!assignee) { setError('担当者を選択してください'); return }
    setError(null)
    start(async () => {
      const r = await createCorrectiveAction(slug, sheetItemId, assignee, due || null, comment || null)
      if (r.error) setError(r.error)
      else { setDone(true); setOpen(false) }
    })
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <ClipboardCheck className="h-3 w-3" />是正担当を割当てました
      </span>
    )
  }

  return (
    <div className="mt-1 inline-block">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
        >
          <ClipboardCheck className="h-3 w-3" />是正を割当
        </button>
      ) : (
        <div className="mt-1 w-72 space-y-2 rounded border bg-background p-2 shadow-sm">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">担当者</label>
            <select
              value={assignee} onChange={e => setAssignee(e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
            >
              <option value="">選択してください</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">期限（任意）</label>
            <input
              type="date" value={due} onChange={e => setDue(e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">指示メモ（任意）</label>
            <textarea
              value={comment} onChange={e => setComment(e.target.value)} rows={2}
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
            />
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <div className="flex items-center justify-end gap-1">
            <button
              type="button" onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >キャンセル</button>
            <button
              type="button" disabled={pending} onClick={submit}
              className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}割当
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
