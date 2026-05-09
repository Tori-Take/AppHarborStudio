// 初期投入ロール（組織が PatrolNavi を初めて開いたとき自動投入）
// is_system: true は削除不可。

export type SeedRole = {
  key:         string
  label:       string
  description: string
  sort_order:  number
  is_system:   boolean
}

export const SEED_ROLES: SeedRole[] = [
  { key: 'patroller',         label: 'パトロール者',           description: 'パトロールを実施する人。シート作成者の既定値。',                            sort_order: 10, is_system: true  },
  { key: 'site_manager',      label: '現場責任者',             description: '現場の責任者。1 次確認を担当する。',                                       sort_order: 20, is_system: false },
  { key: 'supervisor',        label: '作業監督者',             description: '作業班を監督する立場。',                                                   sort_order: 30, is_system: false },
  { key: 'worker',            label: '作業員',                 description: '実際に作業を行う人。',                                                     sort_order: 40, is_system: false },
  { key: 'construction_mgr',  label: '工事管理者',             description: '工事全体の管理者。',                                                       sort_order: 50, is_system: false },
  { key: 'safety_keyman',     label: '安全品質キーマン',       description: '安全と品質をチェックする人。',                                             sort_order: 60, is_system: false },
  { key: 'result_verifier',   label: 'パトロール結果確認者',   description: 'パトロール結果を確認する立場。フローには影響しない閲覧記録。',             sort_order: 70, is_system: false },
  { key: 'result_approver',   label: 'パトロール結果承認者',   description: 'パトロール結果を最終承認する立場。承認で完了。',                           sort_order: 80, is_system: false },
]
