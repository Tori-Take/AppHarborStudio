// ─── PatrolNavi 型定義 ────────────────────────────────────────

export type PatrolChecklistTemplate = {
  id:              string
  organization_id: string
  name:            string
  description:     string | null
  is_active:       boolean
  sort_order:      number
  version:         number
  created_at:      string
  updated_at:      string
  deleted_at:      string | null
}

// v2.4.0: 4 種類の display_style プリセット
export type DisplayStyle = 'normal' | 'important_red' | 'important_bold' | 'critical'
export type InputType    = 'result_only' | 'result_with_number' | 'result_with_text' | 'result_with_choices'

export const DISPLAY_STYLE_LABEL: Record<DisplayStyle, string> = {
  normal:          '通常',
  important_red:   '赤字（重要）',
  important_bold:  '太字（重要）',
  critical:        '赤背景＋太字（最重要）',
}

export type PatrolItem = {
  id:                    string
  organization_id:       string
  checklist_template_id: string
  category1:             string
  category2:             string
  category3:             string             // v2.4.0
  item_text:             string
  sort_order:            number
  is_important:          boolean
  display_style:         DisplayStyle       // v2.4.0
  weight:                number             // v2.4.0
  regulation_ref:        string | null      // v2.4.0
  input_type:            InputType          // v2.4.0
  is_active:             boolean
  created_at:            string
  updated_at:            string
}

export type PatrolWorkflowTemplate = {
  id:              string
  organization_id: string
  name:            string
  description:     string | null
  is_active:       boolean
  sort_order:      number
  created_at:      string
  updated_at:      string
  deleted_at:      string | null
}

// v2.2.0: 4 種別
export type PatrolWorkflowStepType = 'review' | 'comment' | 'notify' | 'final_approve'

export type PatrolWorkflowStep = {
  id:                  string
  template_id:         string
  step_order:          number
  step_name:           string
  step_type:           PatrolWorkflowStepType
  assignee_role_label: string | null  // v2.2.0
  assignee_user_name:  string | null  // v2.2.0
  created_at:          string
  updated_at:          string
}

export const STEP_TYPE_LABEL: Record<PatrolWorkflowStepType, string> = {
  review:        '承認 / 差戻し',
  comment:       'コメント',
  notify:        '閲覧記録',
  final_approve: '最終承認',
}

export const STEP_TYPE_DESC: Record<PatrolWorkflowStepType, string> = {
  review:        '担当者が承認 / 意見を求める を選択。フローを進めるか保留かを判断',
  comment:       'コメント必須で次へ進める。被パトロール者の応答ステップ向け',
  notify:        '担当者が閲覧したかどうかだけ記録。フロー進行をブロックしない',
  final_approve: '承認 = シート完了。並列内に 1 つあれば全体完了',
}

export type PatrolSheetStatus = 'draft' | 'in_progress' | 'completed' | 'remanded'
export type PatrolItemResult   = 'ok' | 'ng' | 'none'
export type PatrolStepStatus   = 'pending' | 'approved' | 'remanded'

export type PatrolCheckSheet = {
  id:                    string
  organization_id:       string
  checklist_template_id: string
  template_version:      number | null
  workflow_template_id:  string
  patrol_date:           string
  site_name:             string
  crew_name:             string | null
  patroller_id:          string
  status:                PatrolSheetStatus
  current_step:          number
  feedback:              string | null
  created_at:            string
  updated_at:            string
  deleted_at:            string | null
}

export type PatrolSheetItem = {
  id:              string
  sheet_id:        string
  item_id:         string | null
  category1:       string
  category2:       string
  category3:       string                  // v2.4.0
  item_text:       string
  is_important:    boolean
  display_style:   DisplayStyle             // v2.4.0
  weight:          number                   // v2.4.0
  regulation_ref:  string | null            // v2.4.0
  input_type:      InputType                // v2.4.0
  sort_order:      number
  result:          PatrolItemResult | null
  photo_urls:      string[]
  comment:         string | null
  created_at:      string
  updated_at:      string
}

export type PatrolSheetStep = {
  id:          string
  sheet_id:    string
  step_order:  number
  step_name:   string
  step_type:   PatrolWorkflowStepType
  assignee_id: string | null
  status:      PatrolStepStatus
  comment:     string | null
  acted_at:    string | null
  created_at:  string
  updated_at:  string
}

// ─── 是正アクション ─────────────────────────────────────────

export type CorrectiveActionStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

export type PatrolCorrectiveAction = {
  id:                string
  organization_id:   string
  sheet_item_id:     string
  assignee_id:       string
  due_date:          string | null
  status:            CorrectiveActionStatus
  comment:           string | null
  before_photo_urls: string[]
  after_photo_urls:  string[]
  created_by:        string
  created_at:        string
  updated_at:        string
  completed_at:      string | null
  completion_note:   string | null
}

export const CORRECTIVE_STATUS_LABEL: Record<CorrectiveActionStatus, string> = {
  open:        '未着手',
  in_progress: '対応中',
  completed:   '完了',
  cancelled:   '取消',
}

export const CORRECTIVE_STATUS_COLOR: Record<CorrectiveActionStatus, string> = {
  open:        'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  cancelled:   'bg-muted text-muted-foreground',
}

// ─── ビュー用の結合型 ────────────────────────────────────────

export type PatrolSheetWithRelations = PatrolCheckSheet & {
  checklist_template: Pick<PatrolChecklistTemplate, 'id' | 'name'>
  workflow_template:  Pick<PatrolWorkflowTemplate, 'id' | 'name'>
  patroller:          { id: string; display_name: string }
  items:              PatrolSheetItem[]
  steps:              (PatrolSheetStep & {
    assignee: { id: string; display_name: string } | null
  })[]
}

// ─── ステータス表示ラベル ─────────────────────────────────────

export const SHEET_STATUS_LABEL: Record<PatrolSheetStatus, string> = {
  draft:       '下書き',
  in_progress: '承認中',
  completed:   '完了',
  remanded:    '差戻し',
}

export const SHEET_STATUS_COLOR: Record<PatrolSheetStatus, string> = {
  draft:       'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  remanded:    'bg-red-100 text-red-700',
}

export const RESULT_LABEL: Record<PatrolItemResult, string> = {
  ok:   '○',
  ng:   '×',
  none: '―',
}

export const RESULT_COLOR: Record<PatrolItemResult, string> = {
  ok:   'text-emerald-600 font-bold',
  ng:   'text-red-600 font-bold',
  none: 'text-muted-foreground',
}
