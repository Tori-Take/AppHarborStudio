import Link             from 'next/link'
import { notFound }     from 'next/navigation'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout } from '../../patrol-layout'
import { isPatrolAdmin } from '../../_helpers/patrolRole'

const supabaseAdmin = getAdminSupabase()
import { Card, CardContent, CardHeader, CardTitle } from '../../_ui/card'
import { buttonVariants } from '../../_ui/button'
import { cn }            from '../../_ui/cn'
import { ArrowLeft, CheckCircle2, XCircle, Pencil, Printer, RotateCcw, X } from 'lucide-react'
import {
  SHEET_STATUS_LABEL,
  SHEET_STATUS_COLOR,
  RESULT_LABEL,
  RESULT_COLOR,
  CORRECTIVE_STATUS_LABEL,
  CORRECTIVE_STATUS_COLOR,
  type PatrolCheckSheet,
  type PatrolSheetItem,
  type PatrolSheetStep,
  type PatrolSheetStatus,
  type PatrolItemResult,
  type PatrolCorrectiveAction,
  type CorrectiveActionStatus,
  type PatrolWorkflowStepType,
} from '../../_types'
import { ApprovalActions } from './approval-actions'
import { PhotoGallery } from './PhotoGallery'
import { withdrawSubmissionAction } from './actions'
import { AssignCorrective } from './AssignCorrective'
import { CommentsPanel, type CommentRow, type OrgUser } from './CommentsPanel'

export default async function PatrolDetailPage({
  params,
}: {
  params: Promise<{ slug: string; sheetId: string }>
}) {
  const { slug, sheetId } = await params

  const ctx = await requireApp(slug, 'patrol-navi')
  const { actor, role } = ctx
  const user = { id: actor.id }
  const orgId = actor.organizationId

  // シート基本情報
  const { data: sheet } = await supabaseAdmin
    .from('patrol_check_sheets')
    .select('*')
    .eq('id', sheetId)
    .single()

  if (!sheet) notFound()

  // テンプレート名
  const [checklistRes, workflowRes] = await Promise.all([
    supabaseAdmin
      .from('patrol_checklist_templates')
      .select('id, name, version')
      .eq('id', (sheet as PatrolCheckSheet).checklist_template_id)
      .single(),
    supabaseAdmin
      .from('patrol_workflow_templates')
      .select('id, name')
      .eq('id', (sheet as PatrolCheckSheet).workflow_template_id)
      .single(),
  ])

  const checklistTemplate = checklistRes.data
  const workflowTemplate  = workflowRes.data

  // 検査項目
  const { data: itemsData } = await supabaseAdmin
    .from('patrol_sheet_items')
    .select('*')
    .eq('sheet_id', sheetId)
    .order('sort_order')

  const items = (itemsData ?? []) as PatrolSheetItem[]

  // 写真の signed URL を一括取得（path → url）
  const photoUrlMap = new Map<string, string>()
  const allPhotoPaths = items.flatMap(i => i.photo_urls ?? [])
  if (allPhotoPaths.length > 0) {
    const sheetOrgId = (sheet as PatrolCheckSheet).organization_id
    const safe = allPhotoPaths.filter(p => p.startsWith(`${sheetOrgId}/${sheetId}/`) && !p.includes('..'))
    for (const p of safe) {
      const { data } = await supabaseAdmin.storage
        .from('patrol-attachments')
        .createSignedUrl(p, 60 * 30)
      if (data?.signedUrl) photoUrlMap.set(p, data.signedUrl)
    }
  }

  // 是正アクション（このシートに紐づく item を対象）
  const itemIds = items.map(i => i.id)
  const correctivesByItem = new Map<string, PatrolCorrectiveAction[]>()
  if (itemIds.length > 0) {
    const { data: cas } = await supabaseAdmin
      .from('patrol_corrective_actions')
      .select('*')
      .in('sheet_item_id', itemIds)
      .order('created_at', { ascending: false })
    for (const ca of (cas ?? []) as PatrolCorrectiveAction[]) {
      const arr = correctivesByItem.get(ca.sheet_item_id) ?? []
      arr.push(ca)
      correctivesByItem.set(ca.sheet_item_id, arr)
    }
  }

  // 組織メンバー（是正担当割当 + @mention 候補）
  const { data: membersData } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('display_name')
  const members = (membersData ?? []) as { id: string; display_name: string }[]

  // v2.3.0: コメントスレッド
  const { data: commentsData } = await supabaseAdmin
    .from('patrol_sheet_comments')
    .select('*')
    .eq('sheet_id', sheetId)
    .order('created_at')
  const comments = (commentsData ?? []) as CommentRow[]
  const orgUsers: OrgUser[] = members

  // 是正担当者の display_name を補完
  const caAssigneeIds = Array.from(new Set(
    Array.from(correctivesByItem.values()).flat().map(c => c.assignee_id)
  ))
  const caAssigneeMap = new Map<string, string>()
  for (const m of members) caAssigneeMap.set(m.id, m.display_name)
  const missingAssignees = caAssigneeIds.filter(id => !caAssigneeMap.has(id))
  if (missingAssignees.length > 0) {
    const { data: more } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .in('id', missingAssignees)
    for (const p of more ?? []) caAssigneeMap.set(p.id as string, p.display_name as string)
  }

  // ワークフローステップ + 担当者名
  const { data: stepsData } = await supabaseAdmin
    .from('patrol_sheet_steps')
    .select('*')
    .eq('sheet_id', sheetId)
    .order('step_order')

  const steps = (stepsData ?? []) as PatrolSheetStep[]

  // 担当者プロフィール取得
  const assigneeIds = steps
    .map(s => s.assignee_id)
    .filter((id): id is string => id !== null)

  const profileMap = new Map<string, string>()
  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .in('id', assigneeIds)
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p.display_name)
    }
  }

  // パトロール者名
  const { data: patrollerProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', (sheet as PatrolCheckSheet).patroller_id)
    .single()

  const typedSheet = sheet as PatrolCheckSheet
  const base = `/org/${slug}/apps/patrol-navi/patrols`

  // 現 stage で「自分が assignee で pending」のステップを探す（並列対応）
  const currentStageSteps = steps.filter(s => s.step_order === typedSheet.current_step && s.status === 'pending')
  const currentStepData = currentStageSteps.find(s =>
    s.assignee_id === user.id || s.assignee_id === null
  ) ?? currentStageSteps[0]
  const canApprove = (
    typedSheet.status === 'in_progress' &&
    currentStepData !== undefined &&
    (currentStepData.assignee_id === null || currentStepData.assignee_id === user.id)
  )

  // 引き戻し可能: 提出者本人 + in_progress + どのステップも未操作
  const anyStepActed = steps.some(s => s.status !== 'pending')
  const canWithdraw = (
    typedSheet.status === 'in_progress' &&
    typedSheet.patroller_id === user.id &&
    !anyStepActed
  )

  // items を category1 でグループ化
  const groups = items.reduce<Record<string, PatrolSheetItem[]>>((acc, item) => {
    const key = item.category1
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const stepStatusLabel: Record<string, string> = {
    pending:  '承認待ち',
    approved: '承認済み',
    remanded: '差戻し',
  }
  const stepStatusStyle: Record<string, string> = {
    pending:  'bg-blue-100 text-blue-700',
    approved: 'bg-emerald-100 text-emerald-700',
    remanded: 'bg-red-100 text-red-700',
  }

  return (
    <PatrolLayout isAdmin={isPatrolAdmin(role)}>
      <div className="space-y-6 p-4 sm:p-8">
        {/* ヘッダー */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link
              href={base}
              className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              パトロール一覧に戻る
            </Link>
            <h1 className="break-words text-xl font-bold sm:text-2xl">{typedSheet.site_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {typedSheet.patrol_date?.slice(0, 10)}
              {typedSheet.crew_name && `　${typedSheet.crew_name}`}
              　担当：{patrollerProfile?.display_name ?? '—'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium',
              SHEET_STATUS_COLOR[typedSheet.status as PatrolSheetStatus]
            )}>
              {SHEET_STATUS_LABEL[typedSheet.status as PatrolSheetStatus]}
            </span>
            {(typedSheet.status === 'draft' || typedSheet.status === 'remanded') && (
              <Link
                href={`${base}/${sheetId}/edit`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                <Pencil className="h-3.5 w-3.5" />
                編集
              </Link>
            )}
            {canWithdraw && (
              <form action={async () => { 'use server'; await withdrawSubmissionAction(slug, sheetId) }}>
                <button
                  type="submit"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-amber-700 border-amber-300 hover:bg-amber-50')}
                  title="提出を取り消して下書きに戻します"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  引き戻す
                </button>
              </form>
            )}
            <Link
              href={`${base}/${sheetId}/print?auto=1`}
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <Printer className="h-3.5 w-3.5" />
              印刷 / PDF
            </Link>
            <Link
              href={base}
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              <X className="h-3.5 w-3.5" />
              閉じる
            </Link>
          </div>
        </div>

        {/* 基本情報 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">チェックリスト</dt>
                <dd className="mt-0.5 font-medium">
                  {checklistTemplate?.name ?? '—'}
                  {typedSheet.template_version != null && (
                    <span className="ml-1.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      v{typedSheet.template_version}
                      {checklistTemplate?.version != null && checklistTemplate.version !== typedSheet.template_version && (
                        <span className="ml-1 text-amber-700">（最新 v{checklistTemplate.version}）</span>
                      )}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">ワークフロー</dt>
                <dd className="mt-0.5 font-medium">{workflowTemplate?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">実施日</dt>
                <dd className="mt-0.5 font-medium">{typedSheet.patrol_date?.slice(0, 10)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">現場名</dt>
                <dd className="mt-0.5 font-medium">{typedSheet.site_name}</dd>
              </div>
              {typedSheet.crew_name && (
                <div>
                  <dt className="text-xs text-muted-foreground">クルー名</dt>
                  <dd className="mt-0.5 font-medium">{typedSheet.crew_name}</dd>
                </div>
              )}
              {typedSheet.feedback && (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-xs text-muted-foreground">フィードバック</dt>
                  <dd className="mt-0.5 text-sm">{typedSheet.feedback}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* ワークフロー進捗 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ワークフロー進捗</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 flex-wrap">
              {steps.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted-foreground text-sm">›</span>}
                  <div className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm',
                    step.status === 'approved' ? 'border-emerald-200 bg-emerald-50' :
                    step.status === 'remanded' ? 'border-red-200 bg-red-50' :
                    typedSheet.current_step === step.step_order ? 'border-blue-200 bg-blue-50' :
                    'border-muted bg-muted/30'
                  )}>
                    {step.status === 'approved' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    {step.status === 'remanded' && <XCircle className="h-4 w-4 text-red-600" />}
                    <div>
                      <p className="font-medium text-xs">
                        {step.step_name}
                        {step.step_type && step.step_type !== 'review' && (
                          <span className="ml-1 inline-flex items-center rounded bg-muted px-1 py-0 text-[9px] font-normal text-muted-foreground">
                            {step.step_type === 'comment' ? 'コメント' : '最終承認'}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {step.assignee_id ? profileMap.get(step.assignee_id) ?? '—' : '担当者未設定'}
                      </p>
                    </div>
                    <span className={cn(
                      'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      stepStatusStyle[step.status]
                    )}>
                      {stepStatusLabel[step.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 承認・差戻しボタン */}
            {canApprove && currentStepData && (
              <div className="mt-6 border-t pt-4">
                <ApprovalActions
                  slug={slug}
                  sheetId={sheetId}
                  stepId={currentStepData.id}
                  stepName={currentStepData.step_name}
                  stepType={(currentStepData.step_type ?? 'review') as PatrolWorkflowStepType}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 検査結果一覧 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              検査結果
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {items.filter(i => i.result !== null).length} / {items.length} 件入力済み
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(groups).map(([category, groupItems]) => (
              <div key={category} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground border-b pb-1">
                  {category}
                </h3>
                <div className="divide-y">
                  {groupItems.map(item => (
                    <div key={item.id} className="flex items-start gap-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {item.is_important && (
                            <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                              重要
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{item.category2}</span>
                        </div>
                        <p className="mt-0.5 text-sm">{item.item_text}</p>
                        {item.comment && (
                          <p className="mt-0.5 text-xs text-muted-foreground italic">
                            コメント: {item.comment}
                          </p>
                        )}
                        {(item.photo_urls?.length ?? 0) > 0 && (
                          <PhotoGallery
                            urls={item.photo_urls
                              .map(p => photoUrlMap.get(p))
                              .filter((u): u is string => Boolean(u))}
                          />
                        )}
                        {item.result === 'ng' && (() => {
                          const cas = correctivesByItem.get(item.id) ?? []
                          const hasOpen = cas.some(c => c.status === 'open' || c.status === 'in_progress')
                          return (
                            <div className="mt-1.5 space-y-1">
                              {cas.map(ca => (
                                <div key={ca.id} className="flex items-center gap-2 text-[11px]">
                                  <span className={cn(
                                    'inline-flex items-center rounded-full px-1.5 py-0.5 font-medium',
                                    CORRECTIVE_STATUS_COLOR[ca.status as CorrectiveActionStatus]
                                  )}>
                                    {CORRECTIVE_STATUS_LABEL[ca.status as CorrectiveActionStatus]}
                                  </span>
                                  <span className="text-muted-foreground">
                                    担当: {caAssigneeMap.get(ca.assignee_id) ?? '—'}
                                    {ca.due_date && `　期限: ${ca.due_date}`}
                                  </span>
                                </div>
                              ))}
                              {!hasOpen && typedSheet.status !== 'draft' && (
                                <AssignCorrective
                                  slug={slug}
                                  sheetItemId={item.id}
                                  members={members}
                                />
                              )}
                            </div>
                          )
                        })()}
                      </div>
                      <div className={cn(
                        'shrink-0 text-base font-bold',
                        item.result ? RESULT_COLOR[item.result as PatrolItemResult] : 'text-muted-foreground'
                      )}>
                        {item.result ? RESULT_LABEL[item.result as PatrolItemResult] : '未入力'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* コメントスレッド */}
        <Card>
          <CardContent className="pt-4">
            <CommentsPanel
              slug={slug}
              sheetId={sheetId}
              comments={comments}
              orgUsers={orgUsers}
              currentUserId={ctx.actor.id}
            />
          </CardContent>
        </Card>
      </div>
    </PatrolLayout>
  )
}
