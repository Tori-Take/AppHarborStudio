'use client'

import { useState, useTransition } from 'react'
import { Button }     from '../../_ui/button'
import { Textarea }   from '../../_ui/textarea'
import { Label }      from '../../_ui/label'
import { CheckCircle2, MessageSquare, ShieldCheck, AlertCircle, AtSign, Eye, RotateCcw } from 'lucide-react'
import { approveStepAction, remandSheetAction } from './actions'
import type { PatrolWorkflowStepType } from '../../_types'

interface ApprovalActionsProps {
  slug:     string
  sheetId:  string
  stepId:   string
  stepName: string
  stepType: PatrolWorkflowStepType
  initialComment?: string
}

export function ApprovalActions({
  slug,
  sheetId,
  stepId,
  stepName,
  stepType,
  initialComment = '',
}: ApprovalActionsProps) {
  const [comment,     setComment]     = useState(initialComment)
  const [error,       setError]       = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  const isComment = stepType === 'comment'
  const isFinal   = stepType === 'final_approve' || (stepType as string) === 'approve'  // v1 互換
  const isNotify  = stepType === 'notify'

  const canRemand = !isComment && !isNotify

  const handleApprove = () => {
    if (isComment && !comment.trim()) {
      setError('コメントを入力してください')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await approveStepAction(slug, sheetId, stepId, comment)
      if (res?.error) setError(res.error)
    })
  }

  const handleRemand = () => {
    if (!comment.trim()) {
      setError('差戻し理由を入力してください')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await remandSheetAction(slug, sheetId, stepId, comment)
      if (res?.error) setError(res.error)
    })
  }

  // 「意見を求める」: コメントスレッドにスクロール（ユーザーが @mention 付きで投稿する）
  const handleAskOpinion = () => {
    setError(null)
    const el = document.querySelector('[data-comments-panel]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => {
        const textarea = document.getElementById('comment-body') as HTMLTextAreaElement | null
        textarea?.focus()
      }, 400)
    }
  }

  // ステップ種別ごとのラベル
  const primaryLabel  = isComment ? 'コメントを投稿'
                      : isFinal   ? '最終承認する（シート完了）'
                      : isNotify  ? '閲覧しました'
                                  : '承認する'
  const PrimaryIcon   = isComment ? MessageSquare
                      : isFinal   ? ShieldCheck
                      : isNotify  ? Eye
                                  : CheckCircle2
  const commentRequired = isComment

  const typeBadgeText = isComment ? 'コメント'
                      : isFinal   ? '最終承認'
                      : isNotify  ? '閲覧記録'
                                  : '承認'

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">
        現在のステップ：<span className="text-primary">{stepName}</span>
        <span className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
          {typeBadgeText}
        </span>
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!isNotify && (
        <div className="space-y-1.5">
          <Label htmlFor="approvalComment">
            コメント
            {commentRequired ? (
              <span className="ml-2 text-xs font-normal text-destructive">必須</span>
            ) : (
              <span className="ml-2 text-xs font-normal text-muted-foreground">任意</span>
            )}
          </Label>
          <Textarea
            id="approvalComment"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={isComment ? 'コメント・所感・指示を入力...' : '承認時のコメント（任意）、差戻し時は理由を入力...'}
            rows={3}
            disabled={isPending}
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={handleApprove}
          disabled={isPending}
          className="flex-1"
        >
          <PrimaryIcon className="mr-1.5 h-4 w-4" />
          {isPending ? '処理中...' : primaryLabel}
        </Button>
        {canRemand && (
          <Button
            variant="destructive"
            onClick={handleRemand}
            disabled={isPending}
            className="flex-1"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            {isPending ? '処理中...' : '差戻し'}
          </Button>
        )}
        {!isNotify && (
          <Button
            variant="outline"
            onClick={handleAskOpinion}
            disabled={isPending}
            className="flex-1"
          >
            <AtSign className="mr-1.5 h-4 w-4" />
            意見を求める
          </Button>
        )}
      </div>

      {!isNotify && (
        <p className="text-xs text-muted-foreground">
          {isComment
            ? '💡 コメントを入力して投稿すると、ワークフローが自動で次へ進みます。'
            : `💡 「意見を求める」でスレッドに移動して @mention で質問できます。差戻しにはコメント（理由）が必須です。`
          }
        </p>
      )}
    </div>
  )
}
