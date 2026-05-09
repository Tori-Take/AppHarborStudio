'use client'

import { useActionState, useState, useEffect } from 'react'
import Link                    from 'next/link'
import { createPatrolSheetAction } from './actions'
import { createBrowserSupabase as createClient } from '@/sdk/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../_ui/card'
import { Button } from '../../_ui/button'
import { Input }               from '../../_ui/input'
import { Label }               from '../../_ui/label'
import { cn }                  from '../../_ui/cn'
import { ArrowLeft, ArrowRight, CheckCircle2, Users, ChevronDown, ChevronUp } from 'lucide-react'
import type { PatrolChecklistTemplate, PatrolWorkflowTemplate, PatrolWorkflowStep } from '../../_types'
import { AssigneePickerButton, type Department, type OrgUser } from '../../_ui/AssigneePicker'

type Step = 1 | 2 | 3

export function NewPatrolClient({
  slug,
  departments,
  currentUserDeptId,
  currentUserId,
  roleMembersByLabel,
}: {
  slug:              string
  departments:       Department[]
  currentUserDeptId: string | null
  currentUserId:     string
  roleMembersByLabel: Record<string, Array<{ id: string; display_name: string }>>
}) {
  const boundAction = createPatrolSheetAction.bind(null, slug)
  const [state, action, isPending] = useActionState(boundAction, {})

  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [checklistTemplates, setChecklistTemplates] = useState<PatrolChecklistTemplate[]>([])
  const [workflowTemplates,  setWorkflowTemplates]  = useState<PatrolWorkflowTemplate[]>([])
  const [workflowSteps,      setWorkflowSteps]       = useState<PatrolWorkflowStep[]>([])
  const [profiles,           setProfiles]            = useState<OrgUser[]>([])

  const [selectedChecklistId, setSelectedChecklistId] = useState('')
  const [selectedWorkflowId,  setSelectedWorkflowId]  = useState('')

  const [patrollerId, setPatrollerId] = useState(currentUserId)

  // step_order → 選択中の assignee user id のマップ
  const [assigneeByStep, setAssigneeByStep] = useState<Record<number, string>>({})

  // クルー名（現場責任者から自動生成、手動編集可）
  const [crewName, setCrewName] = useState('')
  const [crewNameDirty, setCrewNameDirty] = useState(false)

  // ワークフロー設定アコーディオンの開閉
  const [workflowOpen, setWorkflowOpen] = useState(false)

  // データ取得
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('patrol_checklist_templates')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .then(({ data }) => { if (data) setChecklistTemplates(data) })

    supabase
      .from('patrol_workflow_templates')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .then(({ data }) => { if (data) setWorkflowTemplates(data) })

    supabase
      .from('profiles')
      .select('id, display_name, department_id, org_role')
      .order('display_name')
      .then(({ data }) => {
        if (data) {
          // display_name の末尾にあるロール表記「（...）」を除去し、所属部署名 or 役職を付与
          const deptMap = new Map(departments.map(d => [d.id, d.name]))
          const ORG_ROLE_LABEL: Record<string, string> = {
            'org-admin':  '組織管理者',
            'dept-admin': '部署管理者',
            'member':     '',
          }
          const cleaned = (data as Array<OrgUser & { org_role?: string }>).map(p => {
            const baseName = p.display_name.replace(/[（(][^（()]*[)）]\s*$/, '').trim()
            const deptName = p.department_id ? deptMap.get(p.department_id) : null
            const roleLabel = p.org_role ? ORG_ROLE_LABEL[p.org_role] : ''
            const suffix = deptName || roleLabel || ''
            return {
              ...p,
              display_name: suffix ? `${baseName}（${suffix}）` : baseName,
            }
          })
          setProfiles(cleaned)
        }
      })
  }, [departments])

  // 現場名（必須・送信前バリデーション用に状態化）
  const [siteName, setSiteName] = useState('')

  // 現場責任者の名前から「○○クルー」を自動生成（手動編集前のみ）
  useEffect(() => {
    if (crewNameDirty) return
    const siteManagerStep = workflowSteps.find(s => s.assignee_role_label === '現場責任者')
    if (!siteManagerStep) return
    // 解決順: 手動選択 > 役割の既定担当者 > テンプレ固定担当者
    const manualId = assigneeByStep[siteManagerStep.step_order]
    const roleMembers = roleMembersByLabel['現場責任者'] ?? []
    const userId = manualId || roleMembers[0]?.id || ''
    let name = ''
    if (userId) {
      name = profiles.find(p => p.id === userId)?.display_name ?? ''
    } else if (siteManagerStep.assignee_user_name && siteManagerStep.assignee_user_name !== '__patroller_self__') {
      name = siteManagerStep.assignee_user_name
    }
    // 「（部署名）」を除いてからクルー名を構築
    const baseName = name.replace(/[（(][^（()]*[)）]\s*$/, '').trim()
    setCrewName(baseName ? `${baseName}クルー` : '')
  }, [workflowSteps, assigneeByStep, profiles, roleMembersByLabel, crewNameDirty])

  // ワークフロー選択時にステップを取得
  useEffect(() => {
    if (!selectedWorkflowId) {
      setWorkflowSteps([])
      return
    }
    const supabase = createClient()
    supabase
      .from('patrol_workflow_steps')
      .select('*')
      .eq('template_id', selectedWorkflowId)
      .order('step_order')
      .then(({ data }) => { if (data) setWorkflowSteps(data) })
  }, [selectedWorkflowId])

  const canNextStep1 = !!selectedChecklistId
  const canNextStep2 = !!selectedWorkflowId

  const base = `/org/${slug}/apps/patrol-navi/patrols`

  return (
    <div className="max-w-2xl p-8">
      <Link
        href={base}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        パトロール一覧に戻る
      </Link>

      <h1 className="mb-2 text-2xl font-bold">新規パトロール</h1>

      {/* ステッパー */}
      <div className="mb-8 flex items-center gap-2 text-sm">
        {[
          { n: 1, label: 'チェックリスト選択' },
          { n: 2, label: 'ワークフロー選択' },
          { n: 3, label: '基本情報入力' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">›</span>}
            <div className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              currentStep === s.n
                ? 'bg-primary text-primary-foreground'
                : currentStep > s.n
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-muted text-muted-foreground'
            )}>
              {currentStep > s.n
                ? <CheckCircle2 className="h-3 w-3" />
                : <span>{s.n}</span>
              }
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {state.error && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* ─── Step 1: チェックリストテンプレート選択 ─── */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">チェックリストテンプレートを選択</CardTitle>
              <CardDescription>使用するチェックリストを選んでください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {checklistTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">テンプレートが見つかりません</p>
              ) : (
                checklistTemplates.map(t => (
                  <label
                    key={t.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                      selectedChecklistId === t.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <input
                      type="radio"
                      name="checklistTemplate"
                      value={t.id}
                      checked={selectedChecklistId === t.id}
                      onChange={() => {
                        setSelectedChecklistId(t.id)
                        setCurrentStep(2)
                      }}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="font-medium">{t.name}</p>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Step 2: ワークフローテンプレート選択 ─── */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ワークフローテンプレートを選択</CardTitle>
              <CardDescription>承認フローを選んでください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workflowTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">テンプレートが見つかりません</p>
              ) : (
                workflowTemplates.map(t => (
                  <label
                    key={t.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                      selectedWorkflowId === t.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <input
                      type="radio"
                      name="workflowTemplate"
                      value={t.id}
                      checked={selectedWorkflowId === t.id}
                      onChange={() => {
                        setSelectedWorkflowId(t.id)
                        setCurrentStep(3)
                      }}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="font-medium">{t.name}</p>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </CardContent>
          </Card>

          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              戻る
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 3: 基本情報 + 担当者選択 ─── */}
      {currentStep === 3 && (
        <form action={action} className="space-y-4">
          {/* 隠しフィールド */}
          <input type="hidden" name="checklistTemplateId" value={selectedChecklistId} />
          <input type="hidden" name="workflowTemplateId"  value={selectedWorkflowId} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>パトロール者 <span className="text-destructive">*</span></Label>
                <AssigneePickerButton
                  value={patrollerId}
                  onChange={setPatrollerId}
                  departments={departments}
                  users={profiles}
                  currentUserDeptId={currentUserDeptId}
                  currentUserId={currentUserId}
                  valueMode="id"
                  showSentinel={false}
                  showRoles={false}
                  placeholder="パトロール者を選択"
                  storageKey="new-sheet-patroller"
                  disabled={isPending}
                />
                <input type="hidden" name="patrollerId" value={patrollerId} />
                <p className="text-[11px] text-muted-foreground">
                  代理入力の場合は変更してください
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="patrolDate">実施日 <span className="text-destructive">*</span></Label>
                <Input
                  id="patrolDate"
                  name="patrolDate"
                  type="date"
                  required
                  disabled={isPending}
                  defaultValue={(() => {
                    const d = new Date()
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                  })()}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="siteName">現場名 <span className="text-destructive">*</span></Label>
                <Input
                  id="siteName"
                  name="siteName"
                  placeholder="例：○○市△△　00ア123"
                  required
                  disabled={isPending}
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  className="bg-amber-50 hover:bg-amber-100 focus:bg-background"
                />
              </div>

              {(() => {
                const siteManagerStep = workflowSteps.find(s => s.assignee_role_label === '現場責任者')
                if (!siteManagerStep) return null
                const roleMembers = roleMembersByLabel['現場責任者'] ?? []
                const placeholderText = roleMembers.length === 1
                  ? roleMembers[0].display_name
                  : roleMembers.length > 1
                  ? roleMembers.map(m => m.display_name).join('、')
                  : '【現場責任者】を選択'
                const value = assigneeByStep[siteManagerStep.step_order] ?? ''
                const needsSelection = !value && roleMembers.length === 0
                return (
                  <div className="space-y-1.5">
                    <Label>
                      現場責任者
                      <span className="ml-2 text-xs font-normal text-muted-foreground">承認ステップに反映されます</span>
                    </Label>
                    <AssigneePickerButton
                      value={value}
                      onChange={(v) => setAssigneeByStep(prev => ({ ...prev, [siteManagerStep.step_order]: v }))}
                      departments={departments}
                      users={profiles}
                      currentUserDeptId={currentUserDeptId}
                      currentUserId={currentUserId}
                      valueMode="id"
                      showSentinel={false}
                      showRoles={false}
                      placeholder={placeholderText}
                      storageKey="new-sheet-site-manager"
                      disabled={isPending}
                      className={needsSelection ? 'bg-amber-50 hover:bg-amber-100' : undefined}
                    />
                  </div>
                )
              })()}

              <div className="space-y-1.5">
                <Label htmlFor="crewName">
                  クルー名
                  <span className="ml-2 text-xs font-normal text-muted-foreground">任意</span>
                </Label>
                <Input
                  id="crewName"
                  name="crewName"
                  placeholder="例：○○クルー"
                  disabled={isPending}
                  value={crewName}
                  onChange={(e) => {
                    setCrewName(e.target.value)
                    setCrewNameDirty(true)
                  }}
                  className="bg-amber-50 hover:bg-amber-100 focus:bg-background"
                />
              </div>
            </CardContent>
          </Card>

          {/* 全ワークフローステップの担当者を hidden 入力として常に送信
              （アコーディオンの開閉に関わらず、basic info で設定した値が
              フォーム送信に含まれるようにする） */}
          {workflowSteps.map(step => (
            <input
              key={`assignee-${step.step_order}`}
              type="hidden"
              name={`assignee_${step.step_order}`}
              value={assigneeByStep[step.step_order] ?? ''}
            />
          ))}

          {/* ワークフロー設定（アコーディオン） */}
          {workflowSteps.length > 0 && (() => {
            const hasUnsetSteps = workflowSteps.some(s => {
              const roleMembers = s.assignee_role_label
                ? roleMembersByLabel[s.assignee_role_label] ?? []
                : []
              const hasFixedAssignee = s.assignee_user_name && s.assignee_user_name !== '__patroller_self__'
              const isPatrollerRole = s.assignee_user_name === '__patroller_self__'
                || s.assignee_role_label === 'パトロール者'
              return !hasFixedAssignee && !isPatrollerRole && roleMembers.length === 0
                && !assigneeByStep[s.step_order]
            })
            return (
            <Card className={hasUnsetSteps ? 'border-amber-300 bg-amber-50/40' : undefined}>
              <button
                type="button"
                onClick={() => setWorkflowOpen(o => !o)}
                className="flex w-full items-center justify-between gap-2 p-6 text-left"
              >
                <div>
                  <CardTitle className="text-base">ワークフロー設定</CardTitle>
                  <CardDescription className={cn('mt-1', hasUnsetSteps && 'font-medium text-destructive')}>
                    {hasUnsetSteps
                      ? '⚠ 未設定の担当者があります（クリックで詳細）'
                      : '各ステップの担当者は設定済みです（クリックで詳細）'}
                  </CardDescription>
                </div>
                {workflowOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {workflowOpen && (
              <CardContent className="space-y-4">
                {workflowSteps.map(step => {
                  const roleMembers = step.assignee_role_label
                    ? roleMembersByLabel[step.assignee_role_label] ?? []
                    : []
                  const hasFixedAssignee = step.assignee_user_name && step.assignee_user_name !== '__patroller_self__'
                  // パトロール者役割（システム）or __patroller_self__ → 選択中のパトロール実施者を解決
                  const isPatrollerRole = step.assignee_user_name === '__patroller_self__'
                    || step.assignee_role_label === 'パトロール者'
                  const patrollerName = profiles.find(p => p.id === patrollerId)?.display_name ?? ''
                  // 既定値が解決できない（手動選択が必要）かどうか
                  const needsSelection = !hasFixedAssignee && !isPatrollerRole && roleMembers.length === 0
                    && !assigneeByStep[step.step_order]
                  // プレースホルダー: 既定の担当者がいれば表示、なければ役割名
                  const placeholderText = hasFixedAssignee
                    ? step.assignee_user_name!
                    : isPatrollerRole && patrollerName
                    ? `🧍 ${patrollerName}`
                    : step.assignee_user_name === '__patroller_self__'
                    ? '🧍 パトロール実施者本人'
                    : roleMembers.length === 1
                    ? roleMembers[0].display_name
                    : roleMembers.length > 1
                    ? roleMembers.map(m => m.display_name).join('、')
                    : step.assignee_role_label
                    ? `【${step.assignee_role_label}】を選択`
                    : '担当者を選択'
                  return (
                    <div key={step.id} className="space-y-1.5 rounded-md border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          ステージ {step.step_order}: {step.step_name}
                        </span>
                        {step.assignee_role_label && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                            <Users className="h-2.5 w-2.5" />
                            {step.assignee_role_label}
                          </span>
                        )}
                      </div>
                      {hasFixedAssignee && (
                        <p className="text-[11px] text-muted-foreground">
                          📌 担当者固定: <span className="font-medium text-foreground">{step.assignee_user_name}</span>
                        </p>
                      )}
                      {isPatrollerRole && !hasFixedAssignee && (
                        <p className="text-[11px] text-muted-foreground">
                          🧍 担当者: <span className="font-medium text-foreground">{patrollerName || 'パトロール実施者本人'}</span>
                        </p>
                      )}
                      {!hasFixedAssignee && step.assignee_user_name !== '__patroller_self__' && roleMembers.length > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          推奨担当者: <span className="text-foreground">{roleMembers.map(m => m.display_name).join('、')}</span>
                        </p>
                      )}
                      <AssigneePickerButton
                        value={assigneeByStep[step.step_order] ?? ''}
                        onChange={(v) => setAssigneeByStep((prev) => ({ ...prev, [step.step_order]: v }))}
                        departments={departments}
                        users={profiles}
                        currentUserDeptId={currentUserDeptId}
                        currentUserId={currentUserId}
                        valueMode="id"
                        showSentinel={false}
                        showRoles={false}
                        placeholder={placeholderText}
                        storageKey="new-sheet"
                        disabled={isPending}
                        className={needsSelection ? 'bg-amber-50 hover:bg-amber-100' : undefined}
                      />
                    </div>
                  )
                })}
              </CardContent>
              )}
            </Card>
            )
          })()}

          {(() => {
            const hasUnsetWorkflow = workflowSteps.some(s => {
              const roleMembers = s.assignee_role_label
                ? roleMembersByLabel[s.assignee_role_label] ?? []
                : []
              const hasFixedAssignee = s.assignee_user_name && s.assignee_user_name !== '__patroller_self__'
              const isPatrollerRole = s.assignee_user_name === '__patroller_self__'
                || s.assignee_role_label === 'パトロール者'
              return !hasFixedAssignee && !isPatrollerRole && roleMembers.length === 0
                && !assigneeByStep[s.step_order]
            })
            const canSubmit = !!siteName.trim() && !hasUnsetWorkflow
            return (
              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setCurrentStep(2)} disabled={isPending}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  戻る
                </Button>
                <Button type="submit" disabled={isPending || !canSubmit}>
                  {isPending ? '作成中...' : 'パトロール開始'}
                </Button>
              </div>
            )
          })()}
        </form>
      )}
    </div>
  )
}
