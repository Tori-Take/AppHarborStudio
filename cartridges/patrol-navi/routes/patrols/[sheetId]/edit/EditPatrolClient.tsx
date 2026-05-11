'use client'

import { useActionState, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link             from 'next/link'
import { useRouter }    from 'next/navigation'
import { savePatrolResultsAction, submitPatrolAction } from './actions'
import { withdrawSubmissionAction, deletePatrolSheetAction } from '../actions'
import { getPatrolPhotoUrlsAction } from './photoActions'
import { PhotoField } from './PhotoField'
import { SheetPhotoField } from './SheetPhotoField'
import { createBrowserSupabase as createClient } from '@/sdk/client'
import { Card, CardContent, CardHeader, CardTitle } from '../../../_ui/card'
import { Button, buttonVariants } from '../../../_ui/button'
import { cn }           from '../../../_ui/cn'
import { ArrowLeft, Send, Save, AlertCircle, Filter, MessageSquare, Camera, X, ChevronDown, ChevronUp, RotateCcw, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import {
  RESULT_LABEL,
  SHEET_STATUS_LABEL,
  SHEET_STATUS_COLOR,
  type PatrolSheetItem,
  type PatrolItemResult,
  type PatrolCheckSheet,
  type PatrolSheetStatus,
} from '../../../_types'

type ItemState = {
  result:  PatrolItemResult | null
  comment: string
}

export function EditPatrolClient({
  slug,
  sheetId,
  currentUserId,
  isAdmin,
}: {
  slug:          string
  sheetId:       string
  currentUserId: string
  isAdmin:       boolean
}) {
  const router = useRouter()
  const boundSave = savePatrolResultsAction.bind(null, slug, sheetId)
  const [saveState, saveAction, isSaving] = useActionState(boundSave, {})

  const [sheet,         setSheet]         = useState<PatrolCheckSheet | null>(null)
  const [items,         setItems]         = useState<PatrolSheetItem[]>([])
  const [itemStates,    setItemStates]    = useState<Record<string, ItemState>>({})
  const [photoUrls,     setPhotoUrls]     = useState<Record<string, string>>({})
  const [loading,       setLoading]       = useState(true)
  const [submitError,   setSubmitError]   = useState<string | null>(null)
  const [isSubmitting,  setIsSubmitting]  = useState(false)
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [filter,        setFilter]        = useState<'all' | 'unfilled' | 'ng'>('all')
  const [feedback,      setFeedback]      = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [infoExpanded,  setInfoExpanded]  = useState(false)
  const [draftPrompt,   setDraftPrompt]   = useState<{ feedback: string; itemStates: Record<string, ItemState> } | null>(null)
  // ワークフロー進捗用
  type WorkflowStep = {
    id:                            string
    step_order:                    number
    step_name:                     string
    step_type:                     string | null
    status:                        string
    assignee_id:                   string | null
    assignee_user_name_snapshot:   string | null
    assignee_role_label_snapshot:  string | null
  }
  const [workflowStepsList, setWorkflowStepsList] = useState<WorkflowStep[]>([])
  const [stepAssigneeNames, setStepAssigneeNames] = useState<Record<string, string>>({})
  const [anyStepActed,  setAnyStepActed]  = useState(false)

  // 下書き localStorage キー
  const draftKey = `patrol-navi:draft:${sheetId}`

  // データ取得
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase
        .from('patrol_check_sheets')
        .select('*')
        .eq('id', sheetId)
        .single(),
      supabase
        .from('patrol_sheet_items')
        .select('*')
        .eq('sheet_id', sheetId)
        .order('sort_order'),
      // ワークフローステップ全件を取得（進捗表示 + 操作判定用）
      supabase
        .from('patrol_sheet_steps')
        .select('id, step_order, step_name, step_type, status, assignee_id, assignee_user_name_snapshot, assignee_role_label_snapshot')
        .eq('sheet_id', sheetId)
        .order('step_order'),
    ]).then(async ([sheetRes, itemsRes, stepsRes]) => {
      const allSteps = (stepsRes.data ?? []) as WorkflowStep[]
      setWorkflowStepsList(allSteps)
      setAnyStepActed(allSteps.some(s => s.status !== 'pending'))
      // 担当者名を取得
      const assigneeIds = Array.from(new Set(allSteps.map(s => s.assignee_id).filter((id): id is string => !!id)))
      if (assigneeIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', assigneeIds)
        const nameMap: Record<string, string> = {}
        for (const p of (profs as Array<{ id: string; display_name: string }> | null) ?? []) {
          nameMap[p.id] = p.display_name
        }
        setStepAssigneeNames(nameMap)
      }
      if (sheetRes.data) {
        const s = sheetRes.data as PatrolCheckSheet & { feedback?: string | null }
        setSheet(s)
        setFeedback(s.feedback ?? '')
      }
      if (itemsRes.data) {
        const sheetItems = itemsRes.data as PatrolSheetItem[]
        setItems(sheetItems)
        const states: Record<string, ItemState> = {}
        for (const item of sheetItems) {
          // 既定値は「—」(none)。未入力 (null) のまま提出されないように初期表示で埋める
          states[item.id] = {
            result:  item.result ?? 'none',
            comment: item.comment ?? '',
          }
        }
        setItemStates(states)

        // localStorage に未保存の下書きがあれば復元プロンプトを出す
        try {
          const raw = localStorage.getItem(draftKey)
          if (raw) {
            const draft = JSON.parse(raw) as { feedback?: string; itemStates?: Record<string, ItemState> }
            const hasDiff = (draft.feedback ?? '') !== (sheetRes.data?.feedback ?? '')
              || JSON.stringify(draft.itemStates ?? {}) !== JSON.stringify(states)
            if (hasDiff) {
              setDraftPrompt({
                feedback: draft.feedback ?? '',
                itemStates: draft.itemStates ?? {},
              })
            }
          }
        } catch { /* ignore */ }

        // 既存写真の signed URL を一括取得（item + sheet 両方）
        const sheetPhotos = ((sheetRes.data as { feedback_photo_urls?: string[] | null } | null)?.feedback_photo_urls ?? [])
        const allPaths = [...sheetItems.flatMap(i => i.photo_urls ?? []), ...sheetPhotos]
        if (allPaths.length > 0) {
          const res = await getPatrolPhotoUrlsAction(slug, sheetId, allPaths)
          if (res.urls) setPhotoUrls(res.urls)
        }
      }
      setLoading(false)
    })
  }, [sheetId, slug, draftKey])

  // 自動保存: itemStates / feedback の変更時に localStorage へ書き込み（デバウンス）
  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ feedback, itemStates }))
      } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(t)
  }, [feedback, itemStates, loading, draftKey])

  // キーボードショートカット
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    // ArrowUp/Down/Enter: 項目間移動（フォーカス未設定でも先頭項目を選択）
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
      e.preventDefault()
      if (items.length === 0) return
      const idx = focusedItemId ? items.findIndex(i => i.id === focusedItemId) : -1
      const nextIdx = e.key === 'ArrowUp'
        ? Math.max(0, idx - 1)
        : Math.min(items.length - 1, idx + 1)
      const next = items[nextIdx === -1 ? 0 : nextIdx]
      if (next) {
        setFocusedItemId(next.id)
        // 選択された項目を画面中央へスクロール
        requestAnimationFrame(() => {
          const el = document.getElementById(`item-${next.id}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      }
      return
    }

    if (!focusedItemId) return
    const resultMap: Record<string, PatrolItemResult> = {
      '1': 'ok',
      '2': 'ng',
      '3': 'none',
    }
    if (resultMap[e.key]) {
      setItemStates(prev => ({
        ...prev,
        [focusedItemId]: { ...prev[focusedItemId], result: resultMap[e.key] },
      }))
    }
  }, [focusedItemId, items])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // 保存成功時は localStorage の下書きを削除し、一覧画面に遷移
  useEffect(() => {
    if (saveState.success) {
      try { localStorage.removeItem(draftKey) } catch { /* */ }
      router.push(`/org/${slug}/apps/patrol-navi/patrols`)
    }
  }, [saveState.success, draftKey, router, slug])

  const setResult = (itemId: string, result: PatrolItemResult) => {
    setItemStates(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], result },
    }))
  }

  const setComment = (itemId: string, comment: string) => {
    setItemStates(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], comment },
    }))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitError(null)
    // 1. 現在の itemStates を FormData にして save → 結果が DB に永続化
    const fd = new FormData()
    fd.set('feedback', feedback)
    for (const [itemId, state] of Object.entries(itemStates)) {
      if (state.result !== null) {
        fd.set(`result_${itemId}`, state.result)
      }
      if (state.comment) {
        fd.set(`comment_${itemId}`, state.comment)
      }
    }
    const saveRes = await savePatrolResultsAction(slug, sheetId, {}, fd)
    if (saveRes?.error) {
      setSubmitError(saveRes.error)
      setIsSubmitting(false)
      return
    }
    // 2. ステータスを in_progress に
    const res = await submitPatrolAction(slug, sheetId)
    if (res?.error) {
      setSubmitError(res.error)
      setIsSubmitting(false)
    }
    // 成功時は Server Action 内でリダイレクト
  }

  const base = `/org/${slug}/apps/patrol-navi/patrols`

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        読み込み中...
      </div>
    )
  }

  if (!sheet) {
    return <p className="p-8 text-destructive">シートが見つかりません</p>
  }

  // モード判定:
  //   editable    : シートを実際に編集できる（draft/remanded のみ。本人 or admin）
  //                 → in_progress / completed では admin であっても編集不可。
  //                   ワークフロー進行中のデータ改ざんを避けるため。
  //   withdrawable: 引き戻し可能（in_progress の本人 + 未操作）
  //   readOnly    : 上記以外（閲覧のみ）
  const isOwn = sheet.patroller_id === currentUserId
  const isDraftOrRemanded = sheet.status === 'draft' || sheet.status === 'remanded'
  const editable = isDraftOrRemanded && (isOwn || isAdmin)
  const withdrawable = isOwn && sheet.status === 'in_progress' && !anyStepActed
  const readOnly = !editable

  // フィルタ適用後に category1 でグループ化
  const visibleItems = items.filter(i => {
    const r = itemStates[i.id]?.result ?? null
    if (filter === 'unfilled') return r === null
    if (filter === 'ng')       return r === 'ng'
    return true
  })
  const groups = visibleItems.reduce<Record<string, PatrolSheetItem[]>>((acc, item) => {
    const key = item.category1
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const filledCount   = Object.values(itemStates).filter(s => s.result !== null).length
  const totalCount    = items.length
  const ngCount       = Object.values(itemStates).filter(s => s.result === 'ng').length
  const unfilledCount = totalCount - filledCount

  return (
    <div className="p-4 sm:p-8">
      {/* 戻るリンク */}
      <Link
        href={base}
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        パトロール一覧に戻る
      </Link>

      {/* sticky 基本情報バー */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInfoExpanded(o => !o)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {infoExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{sheet.site_name}</span>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {sheet.patrol_date?.slice(0, 10)}
              {sheet.crew_name && ` · ${sheet.crew_name}`}
            </span>
          </button>
          <span className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            SHEET_STATUS_COLOR[sheet.status as PatrolSheetStatus] ?? 'bg-muted text-muted-foreground',
          )}>
            {SHEET_STATUS_LABEL[sheet.status as PatrolSheetStatus] ?? sheet.status}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {filledCount}/{totalCount}
          </span>
        </div>
        {infoExpanded && (
          <div className="mt-2 grid grid-cols-1 gap-2 border-t pt-2 text-xs sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground">実施日</p>
              <p className="font-medium">{sheet.patrol_date?.slice(0, 10)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">現場名</p>
              <p className="font-medium">{sheet.site_name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">クルー名</p>
              <p className="font-medium">{sheet.crew_name ?? '—'}</p>
            </div>
          </div>
        )}
      </div>

      <h1 className="mb-4 text-xl font-bold sm:text-2xl">チェックリスト記入</h1>

      {/* ワークフロー進捗 */}
      {workflowStepsList.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ワークフロー進捗</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {workflowStepsList.map((step, i) => {
                const isApproved = step.status === 'approved'
                const isRemanded = step.status === 'remanded'
                const isCurrent  = !isApproved && !isRemanded && sheet.current_step === step.step_order
                const isFuture   = !isApproved && !isRemanded && !isCurrent
                const assigneeName =
                  step.assignee_user_name_snapshot === '__patroller_self__' ? 'パトロール実施者本人' :
                  step.assignee_id ? stepAssigneeNames[step.assignee_id] ?? '—' :
                  step.assignee_user_name_snapshot ?? '担当者未設定'
                return (
                  <div key={step.id} className="flex items-center gap-2">
                    {i > 0 && <span className="text-sm text-muted-foreground">›</span>}
                    <div className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm',
                      isApproved ? 'border-emerald-200 bg-emerald-50' :
                      isRemanded ? 'border-red-200 bg-red-50' :
                      isCurrent  ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' :
                      'border-muted bg-muted/30 opacity-50'
                    )}>
                      {isApproved && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                      {isRemanded && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                      {isCurrent && <div className="h-2 w-2 shrink-0 rounded-full bg-blue-500 animate-pulse" />}
                      <div>
                        <p className={cn('text-xs font-medium', isFuture && 'text-muted-foreground')}>
                          {step.step_name}
                          {step.assignee_role_label_snapshot && (
                            <span className="ml-1 inline-flex items-center rounded bg-violet-100 px-1 py-0 text-[9px] font-normal text-violet-700">
                              {step.assignee_role_label_snapshot}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{assigneeName}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 下書き復元プロンプト */}
      {draftPrompt && (
        <div className="mb-4 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>未保存の下書きが見つかりました。復元しますか？</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setFeedback(draftPrompt.feedback)
                setItemStates(draftPrompt.itemStates)
                setDraftPrompt(null)
              }}
              className="rounded-md bg-amber-700 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800"
            >
              復元する
            </button>
            <button
              type="button"
              onClick={() => {
                try { localStorage.removeItem(draftKey) } catch { /* */ }
                setDraftPrompt(null)
              }}
              className="rounded-md border border-amber-300 px-3 py-1 text-xs font-medium hover:bg-amber-100"
            >
              破棄
            </button>
          </div>
        </div>
      )}

      {/* フィルタ ツールバー */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <div className="inline-flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
          <Filter className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
          {([
            { key: 'all',      label: `全て (${totalCount})` },
            { key: 'unfilled', label: `未入力 (${unfilledCount})` },
            { key: 'ng',       label: `NG (${ngCount})` },
          ] as const).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium',
                filter === t.key ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* キーボードヒント（PC のみ表示） */}
      <div className="mb-4 hidden items-center gap-4 rounded-lg border bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:flex">
        <span>キーボードショートカット（行を選択中）:</span>
        <span><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">1</kbd> ○</span>
        <span><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">2</kbd> ×</span>
        <span><kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">3</kbd> —</span>
      </div>

      {saveState.error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveState.error}
        </div>
      )}
      {saveState.success && (
        <div className="mb-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          保存しました
        </div>
      )}
      {submitError && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      {/* チェックリスト */}
      <form action={saveAction} className="space-y-6">
        {/* パトロール全体コメント */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base">パトロールコメント</CardTitle>
            <SheetPhotoField
              slug={slug}
              sheetId={sheetId}
              initialPaths={(sheet as PatrolCheckSheet & { feedback_photo_urls?: string[] | null }).feedback_photo_urls ?? []}
              initialUrls={photoUrls}
              triggerVariant="compact"
              disabled={readOnly}
            />
          </CardHeader>
          <CardContent>
            <textarea
              name="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              readOnly={readOnly}
              placeholder="現場の総合所見・特記事項などを入力（任意）"
              rows={3}
              className={cn(
                'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                readOnly && 'cursor-not-allowed bg-muted/50',
              )}
            />
          </CardContent>
        </Card>
        {/* 隠しフィールド: 全アイテムの状態 */}
        {items.map(item => (
          <div key={item.id}>
            <input
              type="hidden"
              name={`result_${item.id}`}
              value={itemStates[item.id]?.result ?? ''}
            />
            <input
              type="hidden"
              name={`comment_${item.id}`}
              value={itemStates[item.id]?.comment ?? ''}
            />
          </div>
        ))}

        {Object.entries(groups).map(([category, groupItems]) => (
          <Card key={category} className="overflow-visible">
            <CardHeader className="sticky top-12 z-20 rounded-t-lg border-b bg-background/95 pb-2 backdrop-blur">
              <CardTitle className="text-base">{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {groupItems.map(item => {
                  const state   = itemStates[item.id] ?? { result: null, comment: '' }
                  const focused = focusedItemId === item.id
                  return (
                    <div
                      key={item.id}
                      id={`item-${item.id}`}
                      onClick={() => setFocusedItemId(item.id)}
                      className={cn(
                        'cursor-pointer py-3 px-2 transition-colors rounded scroll-mt-32',
                        focused ? 'bg-primary/5' : 'hover:bg-muted/40'
                      )}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        {/* テキスト */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {item.is_important && (
                              <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
                                重要
                              </span>
                            )}
                            {item.category2 && <span>{item.category2}</span>}
                            {(item as { category3?: string }).category3 && (
                              <><span>›</span><span>{(item as { category3: string }).category3}</span></>
                            )}
                          </div>
                          <p className={cn(
                            'mt-0.5 text-sm',
                            (item as { display_style?: string }).display_style === 'important_red'  && 'text-red-600',
                            (item as { display_style?: string }).display_style === 'important_bold' && 'font-bold',
                            (item as { display_style?: string }).display_style === 'critical'       && 'font-bold text-red-700 bg-red-50 dark:bg-red-900/20 px-1 rounded',
                          )}>
                            {item.item_text}
                          </p>
                          {(item as { regulation_ref?: string | null }).regulation_ref && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              📖 {(item as { regulation_ref: string }).regulation_ref}
                            </p>
                          )}
                        </div>

                        {/* ○/×/― + コメント/写真ボタン: 横一列 */}
                        <div className="flex shrink-0 gap-2 sm:gap-1">
                          {(['ok', 'ng', 'none'] as PatrolItemResult[]).map(r => {
                            const selected = state.result === r
                            const colorClass =
                              r === 'ok'
                                ? selected
                                  ? 'border-emerald-500 bg-emerald-200 text-emerald-800'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                : r === 'ng'
                                ? selected
                                  ? 'border-red-500 bg-red-200 text-red-800'
                                  : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                                : selected
                                  ? 'border-gray-400 bg-gray-300 text-gray-800'
                                  : 'border-gray-200 bg-gray-100 text-gray-500 hover:bg-gray-200'
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={e => { e.stopPropagation(); if (!readOnly) setResult(item.id, r) }}
                                disabled={readOnly}
                                className={cn(
                                  'flex-1 rounded border text-base font-bold transition-colors h-9 sm:h-8 sm:w-10 sm:flex-none sm:text-sm',
                                  colorClass,
                                  readOnly && 'cursor-not-allowed opacity-70',
                                )}
                              >
                                {RESULT_LABEL[r]}
                              </button>
                            )
                          })}
                          {/* コメント・写真モーダル起動 (正方形) */}
                          {(() => {
                            const hasContent = !!state.comment || (item.photo_urls?.length ?? 0) > 0
                            return (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingItemId(item.id) }}
                                title="コメント / 写真"
                                className={cn(
                                  'relative flex shrink-0 items-center justify-center rounded border transition-colors h-9 w-9 sm:h-8 sm:w-8',
                                  hasContent
                                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : 'border-input bg-background text-muted-foreground hover:bg-muted',
                                )}
                              >
                                <MessageSquare className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                              </button>
                            )
                          })()}
                        </div>
                      </div>

                      {/* コメント本文プレビュー */}
                      {state.comment && (
                        <p className="mt-2 truncate text-xs text-muted-foreground">
                          💬 {state.comment}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* ボタン */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {readOnly ? (
            <>
              {withdrawable ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (!confirm('提出を取り消して下書きに戻します。よろしいですか？')) return
                    try {
                      const res = await withdrawSubmissionAction(slug, sheetId)
                      if (res?.error) setSubmitError(res.error)
                    } catch { /* redirect throws — 想定内 */ }
                    // 同 URL リダイレクトでは React 側が再 mount しない場合があるので
                    // 強制的にハードリロードして最新の sheet 状態を反映する
                    window.location.reload()
                  }}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  引き戻す
                </Button>
              ) : <span />}
              <Link href={base} className={cn(buttonVariants())}>
                <X className="mr-1.5 h-4 w-4" />
                閉じる
              </Link>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Button type="submit" variant="outline" disabled={isSaving || isSubmitting}>
                  <Save className="mr-1.5 h-4 w-4" />
                  {isSaving ? '保存中...' : '一時保存'}
                </Button>
                {/* 自分の下書きのみ削除可能 */}
                {isOwn && sheet.status === 'draft' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      if (!confirm('この下書きを削除します。よろしいですか？')) return
                      const res = await deletePatrolSheetAction(slug, sheetId)
                      if (res?.error) setSubmitError(res.error)
                      // 成功時はサーバーが一覧へリダイレクト
                    }}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    削除
                  </Button>
                )}
              </div>
              {(sheet.status === 'draft' || sheet.status === 'remanded') && (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSaving || isSubmitting || filledCount === 0}
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  {isSubmitting ? '提出中...' : '提出する'}
                </Button>
              )}
            </>
          )}
        </div>
      </form>

      {/* 項目別コメント・写真モーダル */}
      {editingItemId && (() => {
        const item = items.find(i => i.id === editingItemId)
        if (!item) return null
        const state = itemStates[item.id] ?? { result: null, comment: '' }
        return createPortal(
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9998,
              background: 'rgba(0, 0, 0, 0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16, overflowY: 'auto',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setEditingItemId(null) }}
          >
            <div
              className="flex w-full max-w-xl flex-col rounded-lg border bg-background shadow-xl"
              style={{ maxHeight: '85vh' }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {item.category2}
                    {(item as { category3?: string }).category3 && <> › {(item as { category3: string }).category3}</>}
                  </p>
                  <h2 className="mt-0.5 text-sm font-semibold">{item.item_text}</h2>
                </div>
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-7 w-7 shrink-0 p-0"
                  onClick={() => setEditingItemId(null)}
                  aria-label="閉じる"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Body */}
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">コメント</label>
                  <textarea
                    value={state.comment}
                    onChange={(e) => setComment(item.id, e.target.value)}
                    readOnly={readOnly}
                    placeholder="コメント（任意）"
                    rows={4}
                    className={cn(
                      'w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      readOnly && 'cursor-not-allowed bg-muted/50',
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">写真</label>
                  <PhotoField
                    slug={slug}
                    sheetId={sheetId}
                    itemId={item.id}
                    initialPaths={item.photo_urls ?? []}
                    initialUrls={photoUrls}
                    disabled={readOnly}
                    onChange={(paths, urls) => {
                      // 親側 items の photo_urls を更新（モーダル再オープン時に最新を表示するため）
                      setItems(prev => prev.map(i => i.id === item.id ? { ...i, photo_urls: paths } : i))
                      setPhotoUrls(urls)
                    }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                <Button type="button" onClick={() => setEditingItemId(null)}>
                  閉じる
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      })()}
    </div>
  )
}
