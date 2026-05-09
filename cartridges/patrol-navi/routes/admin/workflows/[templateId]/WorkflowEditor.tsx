'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createWorkflowTemplateAction,
  updateWorkflowTemplateAction,
  addWorkflowStepAction,
  deleteWorkflowStepAction,
  swapStageOrderAction,
} from '../actions'
import { Card, CardContent, CardHeader, CardTitle } from '../../../_ui/card'
import { Button } from '../../../_ui/button'
import { Input }  from '../../../_ui/input'
import { Label }  from '../../../_ui/label'
import { cn } from '../../../_ui/cn'
import { Plus, Trash2, ChevronDown, ChevronUp, Users, Pencil, AlertCircle } from 'lucide-react'
import {
  STEP_TYPE_LABEL,
  STEP_TYPE_DESC,
  type PatrolWorkflowTemplate,
  type PatrolWorkflowStep,
  type PatrolWorkflowStepType,
} from '../../../_types'
import { AssigneePickerButton, type Department, type OrgUser } from '../../../_ui/AssigneePicker'
import { EditStepModal } from './EditStepModal'

type Props = {
  slug:               string
  templateId:         string | null
  initialTemplate:    PatrolWorkflowTemplate | null
  initialSteps:       PatrolWorkflowStep[]
  workflowRoles:      Array<{ key: string; label: string }>
  orgUsers:           OrgUser[]
  departments:        Department[]
  currentUserDeptId:  string | null
  currentUserId:      string
}

const STEP_TYPE_BADGE_CLASS: Record<PatrolWorkflowStepType, string> = {
  review:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  comment:       'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  notify:        'bg-muted text-muted-foreground',
  final_approve: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export function WorkflowEditor({
  slug, templateId, initialTemplate, initialSteps,
  workflowRoles, orgUsers, departments, currentUserDeptId, currentUserId,
}: Props) {
  const isNew = !templateId

  // ピッカーの選択状態 (form 送信時は hidden input 経由で送る)
  const [assigneeUserName, setAssigneeUserName] = useState('')
  const [assigneeRoleLabel, setAssigneeRoleLabel] = useState('')

  const boundCreate = createWorkflowTemplateAction.bind(null, slug)
  const boundUpdate = templateId
    ? updateWorkflowTemplateAction.bind(null, templateId, slug)
    : boundCreate

  const [templateState, templateAction, isTemplatePending] = useActionState(
    isNew ? boundCreate : boundUpdate,
    {}
  )

  // 基本情報フォームの「未保存変更あり」検出
  // defaultValue で初期化された input 群を onChange でフックして、
  // 変更が起きたら dirty = true。保存成功でリセット。
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if ((templateState as { success?: boolean }).success) setDirty(false)
  }, [templateState])

  // 閉じるボタンの動作:
  //   - dirty なし → 一覧に直接戻る
  //   - dirty あり → 1 段目: 保存して閉じる / その他
  //                   2 段目: 破棄して閉じる / 編集続ける
  const handleClose = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!dirty) {
      e.preventDefault()
      router.push(`/org/${slug}/apps/patrol-navi/admin/workflows`)
      return
    }
    const saveAndClose = confirm(
      '変更が保存されていません。\n\n' +
      'OK: 保存して閉じる\n' +
      'キャンセル: その他のオプションを表示',
    )
    if (saveAndClose) return  // form submit (with _close_after=true) を継続させる
    e.preventDefault()
    const discard = confirm(
      '変更を破棄して閉じますか？\n\n' +
      'OK: 破棄して閉じる (変更は失われます)\n' +
      'キャンセル: 編集を続ける',
    )
    if (discard) {
      router.push(`/org/${slug}/apps/patrol-navi/admin/workflows`)
    }
  }

  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [addError, setAddError]  = useState<string | null>(null)
  const [isAdding, setIsAdding]  = useState(false)

  // ステップ編集モーダル
  const [editingStep, setEditingStep] = useState<PatrolWorkflowStep | null>(null)

  // React 19 の form action prop は server action 完了後に
  // RSC payload を自動マージするが、この挙動が古いデータを描画する
  // 原因になっていた。onSubmit で完全に制御する形に変更。
  async function handleAddStep(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!templateId) return
    const form = e.currentTarget
    const fd = new FormData(form)

    setAddError(null)
    if (!assigneeRoleLabel) {
      setAddError('役割を選択してください')
      return
    }
    setIsAdding(true)
    try {
      const res = await addWorkflowStepAction(templateId, slug, {}, fd)
      if (res.error) {
        setAddError(res.error)
        return
      }
      // 確実なフルリロード（client cache 全無効化）
      window.location.href = window.location.pathname + '?_=' + Date.now()
    } finally {
      setIsAdding(false)
    }
  }

  // local state は持たず、サーバから来た initialSteps を直接使う。
  // 削除/追加後は router.refresh() で再取得 → initialSteps が更新される
  const steps = initialSteps
  const [, startTransition] = useTransition()

  function handleDeleteStep(stepId: string) {
    startTransition(async () => {
      const res = await deleteWorkflowStepAction(stepId, slug)
      if (!res.error) router.refresh()
    })
  }

  function handleSwapStage(fromOrder: number, toOrder: number) {
    if (!templateId) return
    startTransition(async () => {
      const res = await swapStageOrderAction(templateId, slug, fromOrder, toOrder)
      if (!res.error) {
        // フルリロードで確実に反映
        window.location.href = window.location.pathname + '?_=' + Date.now()
      }
    })
  }

  // step_order でグルーピング（同 step_order = 並列）
  const stages = groupByOrder(steps)
  const lastStepOrder = stages.length > 0 ? Math.max(...stages.map((g) => g.order)) : 0
  const hasFinalApprove = steps.some(s => s.step_type === 'final_approve')

  const selectClass = 'flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

  return (
    <div className="space-y-6">
      {/* タイトル + 保存ボタン (右上) */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {isNew ? 'ワークフローを作成' : 'ワークフローを編集'}
        </h1>
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
                form="workflow-template-form"
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
                form="workflow-template-form"
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

      {/* 基本情報 */}
      <Card>
        <CardHeader><CardTitle className="text-base">基本情報</CardTitle></CardHeader>
        <CardContent>
          <form
            id="workflow-template-form"
            action={templateAction}
            onChange={() => setDirty(true)}
            className="space-y-3"
          >
            {/* テンプレート名 + ステータス を 1 行に */}
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="name">テンプレート名 <span className="text-destructive">*</span></Label>
                <Input
                  id="name" name="name" required
                  disabled={isTemplatePending}
                  defaultValue={initialTemplate?.name ?? ''}
                  placeholder="例: 営業所回付フロー"
                />
              </div>
              {!isNew && (
                <div className="w-32 space-y-1.5">
                  <Label>ステータス</Label>
                  <select name="is_active" disabled={isTemplatePending}
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
            {/* 新規作成時のみ Card 内にボタンを残す (まだステップ追加に進む流れなので) */}
            {isNew && (
              <Button type="submit" disabled={isTemplatePending}>
                {isTemplatePending ? '作成中…' : '作成してステップを追加する'}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ステップ一覧（stage 単位） */}
      {!isNew && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                ワークフロー
                <span className="ml-2 text-sm font-normal text-muted-foreground">{stages.length} ステージ / {steps.length} ステップ</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stages.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  ステップがありません。下のフォームから追加してください。
                </p>
              ) : (
                <div className="space-y-3">
                  {stages.map((stage, idx) => (
                    <div key={stage.order} className="rounded-lg border bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            {stage.order}
                          </div>
                          Stage {stage.order}
                          {stage.steps.length > 1 && (
                            <span className="rounded bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              並列 {stage.steps.length}
                            </span>
                          )}
                        </div>
                        {/* ▲▼ ステージ順序変更 (隣接 swap) */}
                        {(() => {
                          const stageHasFinal = stage.steps.some(s => s.step_type === 'final_approve')
                          const isLast = idx === stages.length - 1
                          const prevHasFinal = idx > 0 && stages[idx - 1].steps.some(s => s.step_type === 'final_approve')
                          const nextHasFinal = !isLast && stages[idx + 1].steps.some(s => s.step_type === 'final_approve')
                          return (
                            <div className="flex items-center gap-0.5">
                              <Button
                                type="button" variant="ghost" size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => handleSwapStage(stage.order, stages[idx - 1].order)}
                                disabled={idx === 0 || (stageHasFinal && isLast)}
                                aria-label="ステージを上に移動"
                                title={stageHasFinal && isLast ? '最終承認は最後から移動できません' : 'ステージを上に移動'}
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button" variant="ghost" size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => handleSwapStage(stage.order, stages[idx + 1].order)}
                                disabled={isLast || nextHasFinal}
                                aria-label="ステージを下に移動"
                                title={nextHasFinal ? '最終承認の後には移動できません' : 'ステージを下に移動'}
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )
                        })()}
                      </div>
                      <div className={cn(
                        'grid gap-2',
                        stage.steps.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1',
                      )}>
                        {stage.steps.map((step) => (
                          <div key={step.id} className="rounded border bg-background p-3 text-sm">
                            <div className="mb-1 flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{step.step_name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <span className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-medium', STEP_TYPE_BADGE_CLASS[(step.step_type ?? 'review') as PatrolWorkflowStepType])}>
                                    {STEP_TYPE_LABEL[(step.step_type ?? 'review') as PatrolWorkflowStepType]}
                                  </span>
                                  {step.assignee_role_label ? (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                                      <Users className="h-2.5 w-2.5" />
                                      {step.assignee_role_label}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                      <AlertCircle className="h-2.5 w-2.5" />
                                      役割未設定
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5">
                                <Button
                                  type="button" variant="ghost" size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => setEditingStep(step)}
                                  aria-label="ステップ編集"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button" variant="ghost" size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteStep(step.id)}
                                  aria-label="ステップ削除"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                              {step.assignee_user_name && step.assignee_user_name !== '__patroller_self__' && (
                                <div>担当者固定: <span className="font-medium text-foreground">{step.assignee_user_name}</span></div>
                              )}
                              {step.assignee_user_name === '__patroller_self__' && (
                                <div>担当者固定: <span className="font-medium text-foreground">🧍 パトロール実施者本人</span></div>
                              )}
                              {!step.assignee_user_name && step.assignee_role_label && (
                                <div className="italic">担当者は役割の既定から選択</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ステップ追加 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ステップを追加</CardTitle>
            </CardHeader>
            <CardContent>
              {hasFinalApprove && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">最終承認ステージが設定済みです</p>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      最終承認の後にステップは追加できません。並列の最終承認者のみ追加可能です。
                      他の種別のステップを追加するには、先に最終承認ステップを削除してください。
                    </p>
                  </div>
                </div>
              )}
              <form
                ref={formRef}
                onSubmit={handleAddStep}
                className="space-y-3"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="step_name" className="text-xs">ステップ名 <span className="text-destructive">*</span></Label>
                    <Input id="step_name" name="step_name" required disabled={isAdding} placeholder={hasFinalApprove ? '例: 副工場長承認' : '例: 現場責任者確認'} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="step_type" className="text-xs">種別</Label>
                    {hasFinalApprove ? (
                      <>
                        <select
                          id="step_type" name="step_type" disabled
                          value="final_approve" className={selectClass}
                        >
                          <option value="final_approve">{STEP_TYPE_LABEL.final_approve} — {STEP_TYPE_DESC.final_approve}</option>
                        </select>
                        <input type="hidden" name="step_type" value="final_approve" />
                      </>
                    ) : (
                      <select
                        id="step_type" name="step_type" disabled={isAdding}
                        defaultValue="review" className={selectClass}
                      >
                        {(['review', 'comment', 'notify', 'final_approve'] as PatrolWorkflowStepType[]).map((t) => (
                          <option key={t} value={t}>{STEP_TYPE_LABEL[t]} — {STEP_TYPE_DESC[t]}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="add_role" className="text-xs">
                      役割 <span className="text-destructive">*</span>
                    </Label>
                    <select
                      id="add_role"
                      value={assigneeRoleLabel}
                      onChange={(e) => setAssigneeRoleLabel(e.target.value)}
                      disabled={isAdding}
                      required
                      className={selectClass}
                    >
                      <option value="">役割を選択してください</option>
                      {workflowRoles.map((r) => (
                        <option key={r.key} value={r.label}>{r.label}</option>
                      ))}
                    </select>
                    <input type="hidden" name="assignee_role_label" value={assigneeRoleLabel} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">担当者（任意）</Label>
                    <AssigneePickerButton
                      value={assigneeUserName}
                      onChange={setAssigneeUserName}
                      departments={departments}
                      users={orgUsers}
                      currentUserDeptId={currentUserDeptId}
                      currentUserId={currentUserId}
                      storageKey="workflow-template-user"
                      disabled={isAdding}
                    />
                    <input type="hidden" name="assignee_user_name"  value={assigneeUserName} />
                    <p className="text-[11px] text-muted-foreground">
                      特定の人に固定したい場合のみ指定。空欄なら役割の既定担当者が使われます。
                    </p>
                  </div>
                  {lastStepOrder > 0 && !hasFinalApprove && (
                    <div className="sm:col-span-2 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                      <input
                        type="checkbox"
                        id="parallel"
                        name="parallel"
                        value="true"
                        disabled={isAdding}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="parallel" className="cursor-pointer text-xs font-normal">
                        ⚡ <strong className="font-medium">並列追加</strong>
                        <span className="text-muted-foreground ml-2">
                          現在の最終 Stage {lastStepOrder} に並列で追加（チェックなし = Stage {lastStepOrder + 1} に直列追加）
                        </span>
                      </Label>
                    </div>
                  )}
                  {hasFinalApprove && (
                    <input type="hidden" name="parallel" value="true" />
                  )}
                </div>
                <Button type="submit" variant="outline" disabled={isAdding}>
                  <Plus className="h-4 w-4" />
                  {isAdding ? '追加中…' : hasFinalApprove ? '並列の最終承認者を追加' : '追加'}
                </Button>
              </form>
              {addError && <p className="mt-2 text-sm text-destructive">{addError}</p>}
              {!hasFinalApprove && (
                <p className="mt-3 flex items-start gap-1 text-xs text-muted-foreground">
                  <ChevronDown className="h-3 w-3 mt-0.5 shrink-0" />
                  既定は直列追加（次の Stage に進む）。並列にしたい時だけチェック。
                  例: Stage 3 「工事管理者」を直列で追加 → さらに「安全品質キーマン」を並列追加 → Stage 3 が並列 2 ステップに。
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ステップ編集モーダル */}
      {editingStep && (
        <EditStepModal
          slug={slug}
          step={editingStep}
          workflowRoles={workflowRoles}
          orgUsers={orgUsers}
          departments={departments}
          currentUserDeptId={currentUserDeptId}
          currentUserId={currentUserId}
          hasFinalApprove={hasFinalApprove}
          onClose={() => setEditingStep(null)}
          onSaved={() => {
            setEditingStep(null)
            // フルリロードで最新のステップ内容を反映
            window.location.href = window.location.pathname + '?_=' + Date.now()
          }}
        />
      )}
    </div>
  )
}

// step_order でグルーピング、stage 単位の配列を返す
function groupByOrder(steps: PatrolWorkflowStep[]): Array<{ order: number; steps: PatrolWorkflowStep[] }> {
  const map = new Map<number, PatrolWorkflowStep[]>()
  for (const s of steps) {
    const arr = map.get(s.step_order) ?? []
    arr.push(s)
    map.set(s.step_order, arr)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([order, steps]) => ({ order, steps }))
}
