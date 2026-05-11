'use client'

/**
 * チェックリスト / ワークフロー一覧の共通行コンポーネント。
 *
 * - 行クリック → 編集ページへ遷移
 * - 📋 コピー / 🗑 削除 ボタン (stopPropagation で行遷移をブロック)
 *
 * Server Component (page.tsx) からインライン関数を props で受け取れないため、
 * `kind` と `templateId` / `slug` を受け取り、内部で server action を呼ぶ。
 */

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Copy, Trash2, ChevronRight, Download } from 'lucide-react'
import { Button } from '../_ui/button'
import { cn } from '../_ui/cn'
import {
  copyChecklistTemplateAction,
  deleteChecklistTemplateAction,
  exportChecklistTemplateAction,
} from './checklists/actions'
import {
  copyWorkflowTemplateAction,
  deleteWorkflowTemplateAction,
} from './workflows/actions'

type Kind = 'checklist' | 'workflow'

type Props = {
  kind:        Kind
  templateId:  string
  slug:        string
  href:        string
  copyHrefBase:string
  icon:        React.ReactNode
  name:        string
  description: string | null
  badge?:      string
  isActive:    boolean
}

export function TemplateListRow({
  kind, templateId, slug,
  href, copyHrefBase,
  icon, name, description, badge, isActive,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const goEdit = () => router.push(href)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (pending) return
    start(async () => {
      const action = kind === 'checklist' ? copyChecklistTemplateAction : copyWorkflowTemplateAction
      const res = await action(templateId, slug)
      if (res.error) {
        alert(`コピー失敗: ${res.error}`)
        return
      }
      if (res.newId) {
        router.push(`${copyHrefBase}/${res.newId}`)
      } else {
        router.refresh()
      }
    })
  }

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (pending) return
    start(async () => {
      const res = await exportChecklistTemplateAction(templateId, slug)
      if (res.error || !res.csv) {
        alert(`エクスポート失敗: ${res.error ?? '不明なエラー'}`)
        return
      }
      const bom  = '﻿'
      const blob = new Blob([bom + res.csv], { type: 'text/csv;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${res.templateName ?? 'checklist'}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (pending) return
    if (!confirm(
      `「${name}」を削除しますか？\n\n` +
      '※ 既に作成済みのシートには影響しません (シートはスナップショット保持)。\n' +
      '※ 削除はソフト削除なので、DB 上にはレコードが残ります。',
    )) return
    start(async () => {
      const action = kind === 'checklist' ? deleteChecklistTemplateAction : deleteWorkflowTemplateAction
      const res = await action(templateId, slug)
      if (res.error) {
        alert(`削除失敗: ${res.error}`)
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goEdit}
      onKeyDown={(e) => { if (e.key === 'Enter') goEdit() }}
      className={cn(
        'flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 cursor-pointer',
        pending && 'opacity-60 pointer-events-none',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{name}</p>
          {badge && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground truncate">{description}</p>
        )}
      </div>
      <span className={cn(
        'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
        isActive
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-muted text-muted-foreground',
      )}>
        {isActive ? '有効' : '無効'}
      </span>
      <Button
        type="button" variant="ghost" size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        onClick={handleCopy}
        title="複製"
        aria-label="複製"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      {kind === 'checklist' && (
        <Button
          type="button" variant="ghost" size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={handleExport}
          title="エクスポート"
          aria-label="エクスポート"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        type="button" variant="ghost" size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        onClick={handleDelete}
        title="削除"
        aria-label="削除"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  )
}
