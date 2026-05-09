'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, AlertCircle, AtSign, Check, Loader2 } from 'lucide-react'
import { Button }     from '../../_ui/button'
import { Textarea }   from '../../_ui/textarea'
import { Label }      from '../../_ui/label'
import { cn }         from '../../_ui/cn'
import { postCommentAction } from './comment-actions'

export type CommentRow = {
  id:                    string
  author_user_id:        string | null
  author_name_snapshot:  string
  body:                  string
  mentioned_user_ids:    string[]
  mentioned_user_names:  string[]
  requires_response:     boolean
  resolved_at:           string | null
  created_at:            string
}

export type OrgUser = {
  id:           string
  display_name: string
}

type Props = {
  slug:           string
  sheetId:        string
  comments:       CommentRow[]
  orgUsers:       OrgUser[]
  currentUserId:  string
}

export function CommentsPanel({ slug, sheetId, comments, orgUsers, currentUserId }: Props) {
  const router = useRouter()
  const [body, setBody]                       = useState('')
  const [requiresResponse, setRequiresResponse] = useState(false)
  const [mentionedIds, setMentionedIds]       = useState<string[]>([])
  const [error, setError]                     = useState<string | null>(null)
  const [isPosting, setIsPosting]             = useState(false)

  function toggleMention(userId: string) {
    setMentionedIds((prev) => prev.includes(userId)
      ? prev.filter((id) => id !== userId)
      : [...prev, userId])
  }

  async function handlePost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!body.trim()) {
      setError('コメントを入力してください')
      return
    }
    setError(null)
    setIsPosting(true)
    try {
      const fd = new FormData()
      fd.set('body', body)
      fd.set('requires_response', requiresResponse ? 'true' : 'false')
      fd.set('mentioned_user_ids', mentionedIds.join(','))
      const res = await postCommentAction(slug, sheetId, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      setBody('')
      setRequiresResponse(false)
      setMentionedIds([])
      router.refresh()
    } finally {
      setIsPosting(false)
    }
  }

  const sortedComments = [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at))

  return (
    <section className="space-y-4" data-comments-panel>
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        <h2 className="text-base font-medium">スレッド</h2>
        <span className="text-sm text-muted-foreground">({comments.length})</span>
      </div>

      {/* 既存コメント一覧 */}
      {sortedComments.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          コメントはまだありません。
        </p>
      ) : (
        <ul className="space-y-3">
          {sortedComments.map((c) => {
            const isMe        = c.author_user_id === currentUserId
            const mentionedMe = c.mentioned_user_ids.includes(currentUserId)
            const isOpen      = c.requires_response && !c.resolved_at
            return (
              <li
                key={c.id}
                className={cn(
                  'rounded-lg border p-3',
                  isOpen
                    ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-900/10'
                    : 'bg-muted/20',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-medium', isMe && 'text-primary')}>
                      {c.author_name_snapshot}
                    </span>
                    {c.requires_response && (
                      isOpen ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          <AlertCircle className="h-3 w-3" />
                          返答待ち
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          <Check className="h-3 w-3" />
                          返答済
                        </span>
                      )
                    )}
                    {mentionedMe && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        @自分
                      </span>
                    )}
                  </div>
                  <time className="text-[11px] text-muted-foreground">
                    {formatDate(c.created_at)}
                  </time>
                </div>
                {c.mentioned_user_names.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                    <AtSign className="h-3 w-3 text-muted-foreground" />
                    {c.mentioned_user_names.map((name, i) => (
                      <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>
              </li>
            )
          })}
        </ul>
      )}

      {/* 投稿フォーム */}
      <form onSubmit={handlePost} className="space-y-3 rounded-lg border bg-background p-3">
        <div className="space-y-1">
          <Label htmlFor="comment-body" className="text-xs">コメント</Label>
          <Textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="質問・確認事項・意見など"
            disabled={isPosting}
            rows={3}
          />
        </div>

        {/* @mention selector */}
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <AtSign className="h-3 w-3" />
            @mention（複数選択可）
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {orgUsers.map((u) => {
              const selected = mentionedIds.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleMention(u.id)}
                  disabled={isPosting}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {u.display_name}
                </button>
              )
            })}
          </div>
          {mentionedIds.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {mentionedIds.length} 人を mention します
            </p>
          )}
        </div>

        {/* requires_response */}
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={requiresResponse}
            onChange={(e) => setRequiresResponse(e.target.checked)}
            disabled={isPosting}
            className="h-4 w-4"
          />
          <span>
            <strong>返答必須</strong>
            <span className="ml-1 text-muted-foreground">
              （mention されたユーザーの誰かが返信するまで「返答待ち」表示）
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPosting || !body.trim()} size="sm">
            {isPosting ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
            投稿
          </Button>
        </div>
      </form>
    </section>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const Y = d.getFullYear()
    const M = String(d.getMonth() + 1).padStart(2, '0')
    const D = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${Y}/${M}/${D} ${h}:${m}`
  } catch {
    return iso
  }
}
