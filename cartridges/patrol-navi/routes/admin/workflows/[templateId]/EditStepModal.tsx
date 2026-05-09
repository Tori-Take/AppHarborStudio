'use client'

/**
 * ステップ編集モーダル
 *
 * 既存ワークフローステップの内容を編集する:
 *   - step_name
 *   - step_type
 *   - assignee_role_label (役割: 必須・役割管理から選択)
 *   - assignee_user_name  (担当者: 任意・特定の人を固定する場合のみ)
 *
 * step_order の変更はしない (並列構造を壊さないため)。
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '../../../_ui/button'
import { Input } from '../../../_ui/input'
import { Label } from '../../../_ui/label'
import { AssigneePickerButton, type Department, type OrgUser } from '../../../_ui/AssigneePicker'
import {
  STEP_TYPE_LABEL, STEP_TYPE_DESC,
  type PatrolWorkflowStep, type PatrolWorkflowStepType,
} from '../../../_types'
import { updateWorkflowStepAction } from '../actions'

type Props = {
  slug:              string
  step:              PatrolWorkflowStep
  workflowRoles:     Array<{ key: string; label: string }>
  orgUsers:          OrgUser[]
  departments:       Department[]
  currentUserDeptId: string | null
  currentUserId:     string
  hasFinalApprove:   boolean
  onClose:           () => void
  onSaved:           () => void
}

const SELECT_CLASS = 'flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function EditStepModal({
  slug, step, workflowRoles, orgUsers, departments,
  currentUserDeptId, currentUserId, hasFinalApprove, onClose, onSaved,
}: Props) {
  const [stepName, setStepName] = useState(step.step_name)
  const [stepType, setStepType] = useState<PatrolWorkflowStepType>(
    (step.step_type ?? 'review') as PatrolWorkflowStepType,
  )
  const [assigneeUserName, setAssigneeUserName] = useState(step.assignee_user_name ?? '')
  const [assigneeRoleLabel, setAssigneeRoleLabel] = useState(step.assignee_role_label ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!assigneeRoleLabel) {
      setError('役割を選択してください')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('step_name',           stepName)
      fd.set('step_type',           stepType)
      fd.set('assignee_user_name',  assigneeUserName)
      fd.set('assignee_role_label', assigneeRoleLabel)
      const res = await updateWorkflowStepAction(step.id, slug, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex w-full max-w-xl flex-col rounded-lg border bg-background shadow-xl"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">
            ステップを編集
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Stage {step.step_order}
            </span>
          </h2>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} aria-label="閉じる">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body (form) */}
        <form onSubmit={handleSave} className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit_step_name">
              ステップ名 <span className="text-destructive">*</span>
            </Label>
            <Input
              ref={inputRef}
              id="edit_step_name"
              value={stepName}
              onChange={(e) => setStepName(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_step_type">種別</Label>
            <select
              id="edit_step_type"
              value={stepType}
              onChange={(e) => setStepType(e.target.value as PatrolWorkflowStepType)}
              disabled={saving}
              className={SELECT_CLASS}
            >
              {(['review','comment','notify','final_approve'] as PatrolWorkflowStepType[])
                .filter((t) => t !== 'final_approve' || !hasFinalApprove || stepType === 'final_approve')
                .map((t) => (
                  <option key={t} value={t}>{STEP_TYPE_LABEL[t]} — {STEP_TYPE_DESC[t]}</option>
                ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_role">
              役割 <span className="text-destructive">*</span>
            </Label>
            <select
              id="edit_role"
              value={assigneeRoleLabel}
              onChange={(e) => setAssigneeRoleLabel(e.target.value)}
              disabled={saving}
              required
              className={SELECT_CLASS}
            >
              <option value="">役割を選択してください</option>
              {workflowRoles.map((r) => (
                <option key={r.key} value={r.label}>{r.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              役割管理で定義した役割から選択。役割の既定担当者がパトロール提出時の候補になります。
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>担当者（任意）</Label>
            <AssigneePickerButton
              value={assigneeUserName}
              onChange={setAssigneeUserName}
              departments={departments}
              users={orgUsers}
              currentUserDeptId={currentUserDeptId}
              currentUserId={currentUserId}
              storageKey="workflow-template-user"
              disabled={saving}
            />
            <p className="text-[11px] text-muted-foreground">
              特定の人に固定したい場合のみ指定。空欄なら役割の既定担当者が使われます。
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !stepName.trim()}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
