'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createChecklistTemplateAction,
  updateChecklistTemplateAction,
  deletePatrolItemAction,
  swapPatrolItemOrderAction,
} from '../actions'
import { Card, CardContent, CardHeader, CardTitle } from '../../../_ui/card'
import { Button }  from '../../../_ui/button'
import { Input }   from '../../../_ui/input'
import { Label }   from '../../../_ui/label'
import { cn }      from '../../../_ui/cn'
import { Plus, Trash2, Star, Pencil, ChevronUp, ChevronDown } from 'lucide-react'
import type { PatrolChecklistTemplate, PatrolItem, DisplayStyle } from '../../../_types'
import { EditItemModal } from './EditItemModal'
import { AddItemModal } from './AddItemModal'
import { CsvButtons } from './CsvButtons'

const DISPLAY_STYLE_CLASS: Record<DisplayStyle, string> = {
  normal:          '',
  important_red:   'text-red-600',
  important_bold:  'font-bold',
  critical:        'font-bold text-red-700 bg-red-50 dark:bg-red-900/20 px-1 rounded',
}

type Props = {
  slug:            string
  templateId:      string | null
  orgId:           string
  initialTemplate: PatrolChecklistTemplate | null
  initialItems:    PatrolItem[]
}

export function ChecklistEditor({
  slug, templateId, orgId: _orgId, initialTemplate, initialItems,
}: Props) {
  const isNew = !templateId

  const boundCreate = createChecklistTemplateAction.bind(null, slug)
  const boundUpdate = templateId
    ? updateChecklistTemplateAction.bind(null, templateId, slug)
    : boundCreate

  const [templateState, templateAction, isTemplatePending] = useActionState(
    isNew ? boundCreate : boundUpdate,
    {}
  )

  const router = useRouter()
  const [editingItem, setEditingItem] = useState<PatrolItem | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if ((templateState as { success?: boolean }).success) setDirty(false)
  }, [templateState])

  const handleClose = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!dirty) {
      e.preventDefault()
      router.push(`/org/${slug}/apps/patrol-navi/admin/checklists`)
      return
    }
    const saveAndClose = confirm(
      '変更が保存されていません。\n\n' +
      'OK: 保存して閉じる\n' +
      'キャンセル: その他のオプションを表示',
    )
    if (saveAndClose) return
    e.preventDefault()
    const discard = confirm(
      '変更を破棄して閉じますか？\n\n' +
      'OK: 破棄して閉じる (変更は失われます)\n' +
      'キャンセル: 編集を続ける',
    )
    if (discard) {
      router.push(`/org/${slug}/apps/patrol-navi/admin/checklists`)
    }
  }

  const items = initialItems
  const [, startTransition] = useTransition()

  const categoryData = (() => {
    const cat1Set = new Set<string>()
    const cat2Map = new Map<string, Set<string>>()
    const cat3Map = new Map<string, Set<string>>()
    for (const it of items) {
      const c1 = it.category1 ?? ''
      const c2 = it.category2 ?? ''
      const c3 = it.category3 ?? ''
      if (c1) cat1Set.add(c1)
      if (c1 && c2) {
        if (!cat2Map.has(c1)) cat2Map.set(c1, new Set())
        cat2Map.get(c1)!.add(c2)
      }
      if (c1 && c2 && c3) {
        const key = `${c1}\0${c2}`
        if (!cat3Map.has(key)) cat3Map.set(key, new Set())
        cat3Map.get(key)!.add(c3)
      }
    }
    return {
      cat1List: [...cat1Set].sort(),
      getCat2List: (c1: string) => [...(cat2Map.get(c1) ?? [])].sort(),
      getCat3List: (c1: string, c2: string) => [...(cat3Map.get(`${c1}\0${c2}`) ?? [])].sort(),
    }
  })()

  function handleDelete(itemId: string) {
    startTransition(async () => {
      const res = await deletePatrolItemAction(itemId, slug)
      if (!res.error) router.refresh()
    })
  }

  function handleSwapItems(itemAId: string, itemBId: string) {
    startTransition(async () => {
      const res = await swapPatrolItemOrderAction(itemAId, itemBId, slug)
      if (!res.error) {
        window.location.href = window.location.pathname + '?_=' + Date.now()
      }
    })
  }

  const selectClass = 'flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

  return (
    <div className="space-y-6">
      {/* ─── タイトル + 保存ボタン (右上) ─── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {isNew ? 'チェックリストを作成' : 'チェックリストを編集'}
          </h1>
          {!isNew && initialTemplate && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              v{(initialTemplate as { version?: number | null }).version ?? 1}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(templateState as { success?: boolean }).success && (
            <span className="text-xs text-emerald-600">✓ 保存しました</span>
          )}
          {templateState.error && (
            <span className="text-xs text-destructive">{templateState.error}</span>
          )}
          {!isNew && (
            <>
              <Button
                type="submit"
                form="checklist-template-form"
                name="_close_after"
                value="false"
                variant="outline"
                disabled={isTemplatePending || !dirty}
                title="変更を保存してこのページに留まる"
              >
                {isTemplatePending ? '保存中…' : '保存する'}
              </Button>
              <Button
                type="submit"
                form="checklist-template-form"
                name="_close_after"
                value="true"
                disabled={isTemplatePending}
                onClick={handleClose}
                title="変更があれば保存してから一覧に戻る"
              >
                閉じる
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── テンプレート基本情報 ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            id="checklist-template-form"
            action={templateAction}
            onChange={() => setDirty(true)}
            className="space-y-3"
          >
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="name">テンプレート名 <span className="text-destructive">*</span></Label>
                <Input
                  id="name" name="name" required
                  disabled={isTemplatePending}
                  defaultValue={initialTemplate?.name ?? ''}
                  placeholder="例: 建設現場パトロール（標準）"
                />
              </div>
              {!isNew && (
                <div className="w-32 space-y-1.5">
                  <Label htmlFor="is_active">ステータス</Label>
                  <select
                    id="is_active" name="is_active"
                    disabled={isTemplatePending}
                    defaultValue={String(initialTemplate?.is_active ?? true)}
                    className={selectClass}
                  >
                    <option value="true">有効</option>
                    <option value="false">無効</option>
                  </select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">説明</Label>
              <Input
                id="description" name="description"
                disabled={isTemplatePending}
                defaultValue={initialTemplate?.description ?? ''}
                placeholder="任意"
              />
            </div>
            {isNew && (
              <Button type="submit" disabled={isTemplatePending}>
                {isTemplatePending ? '作成中…' : '作成して項目を追加する'}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ─── チェック項目一覧（テンプレート作成後のみ） ─── */}
      {!isNew && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                チェック項目
                <span className="ml-2 text-sm font-normal text-muted-foreground">{items.length}件</span>
              </CardTitle>
              {templateId && (
                <div className="flex flex-wrap items-center gap-2">
                  <CsvButtons slug={slug} templateId={templateId} />
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddModal(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    項目を追加
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  チェック項目がありません。上の「項目を追加」ボタンから追加してください。
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {items.map((item, idx) => (
                    <div key={item.id} className="flex items-start gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                          {item.category1 && <span>{item.category1}</span>}
                          {item.category2 && <><span>&rsaquo;</span><span>{item.category2}</span></>}
                          {item.category3 && <><span>&rsaquo;</span><span>{item.category3}</span></>}
                        </div>
                        <p className={cn('text-sm', DISPLAY_STYLE_CLASS[item.display_style ?? 'normal'])}>
                          {item.is_important && <Star className="inline h-3 w-3 mr-1" />}
                          {item.item_text}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {item.weight !== 1 && <span>重み: <span className="font-medium text-foreground">{item.weight}</span></span>}
                          {item.regulation_ref && <span>📖 {item.regulation_ref}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => handleSwapItems(item.id, items[idx - 1].id)}
                          disabled={idx === 0}
                          aria-label="上に移動"
                          title="上に移動"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => handleSwapItems(item.id, items[idx + 1].id)}
                          disabled={idx === items.length - 1}
                          aria-label="下に移動"
                          title="下に移動"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingItem(item)}
                          aria-label="項目編集"
                          title="項目を編集"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(item.id)}
                          aria-label="項目削除"
                          title="項目を削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </>
      )}

      {editingItem && (
        <EditItemModal
          slug={slug}
          item={editingItem}
          categoryData={categoryData}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null)
            window.location.href = window.location.pathname + '?_=' + Date.now()
          }}
        />
      )}

      {showAddModal && templateId && (
        <AddItemModal
          slug={slug}
          templateId={templateId}
          categoryData={categoryData}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false)
            window.location.href = window.location.pathname + '?_=' + Date.now()
          }}
        />
      )}
    </div>
  )
}
