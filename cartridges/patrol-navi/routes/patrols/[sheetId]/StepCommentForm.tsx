'use client'

import { useState, useTransition } from 'react'
import { Button } from '../../_ui/button'
import { MessageSquare } from 'lucide-react'
import { addStepCommentAction } from './actions'

export function StepCommentForm({
  slug,
  sheetId,
  stepId,
  stepName,
}: {
  slug: string
  sheetId: string
  stepId: string
  stepName: string
}) {
  const [comment, setComment] = useState('')
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  if (done) return null

  const handleSubmit = () => {
    if (!comment.trim()) return
    startTransition(async () => {
      const res = await addStepCommentAction(slug, sheetId, stepId, comment)
      if (!res.error) setDone(true)
    })
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        {stepName}：コメントを追加
      </p>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="コメントを入力..."
        rows={2}
        disabled={isPending}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Button size="sm" onClick={handleSubmit} disabled={isPending || !comment.trim()}>
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
        {isPending ? '送信中...' : 'コメントを投稿'}
      </Button>
    </div>
  )
}
