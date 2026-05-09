'use client'

/**
 * 担当者ピッカー (2 ペインモーダル) v2
 *
 * 左ペイン: ナビゲーション (おすすめ / 最近 / お気に入り / 自部署 / 全部署 / 役割)
 * 右ペイン: 左で選んだスコープのユーザー一覧
 *
 * 機能 (Tier 1-4 集約):
 *   - 検索ボックス (名前 / 部署 / 役割) 横断ヒット
 *   - 直近選択履歴 (localStorage)
 *   - お気に入り (★ ピン留め localStorage)
 *   - 「🙋 自分」ショートカット (現ユーザー即選択)
 *   - 自部署優先 (📌 緑) + 全部署 + 組織管理者
 *   - 役割選択 (assignee_role_label)
 *   - キーボードナビ (↓↑ 移動 / Enter 確定 / Esc 閉じる)
 *   - 部署色イニシャルアバター
 *   - 役職順ソート (本部長 → 部長 → メンバー)
 *   - 検索ヒット黄色ハイライト
 *   - 空白部署の自動非表示
 *   - モバイル対応 (狭幅で 1 ペイン切替)
 *   - ホバー詳細 (title 属性)
 *
 * 値の保存形式:
 *   - ''                   → 未指定
 *   - '__patroller_self__' → パトロール者本人 sentinel
 *   - 任意の文字列         → user.display_name または user.id (valueMode による)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Star, Check, ChevronRight, ChevronDown, Users, ArrowLeft } from 'lucide-react'
import { Button } from './button'
import { cn } from './cn'

export type Department = {
  id:        string
  name:      string
  parent_id: string | null
}

export type OrgUser = {
  id:            string
  display_name:  string
  department_id: string | null
}

export type WorkflowRole = {
  key:   string
  label: string
}

type Props = {
  value:               string
  onChange:            (val: string) => void
  onChangeRoleLabel?:  (roleLabel: string) => void
  departments:         Department[]
  users:               OrgUser[]
  workflowRoles?:      WorkflowRole[]
  currentUserDeptId:   string | null
  /** 「🙋 自分」ショートカット用 — 現ユーザーの id */
  currentUserId?:      string
  disabled?:           boolean
  valueMode?:          'display_name' | 'id'
  showSentinel?:       boolean
  showRoles?:          boolean
  placeholder?:        string
  /** localStorage の名前空間。複数の用途で履歴を分けたい時に指定 */
  storageKey?:         string
  /** トリガーボタンに追加する className（背景色のオーバーライド等） */
  className?:          string
}

// ─────────────────────────────────────────────
// Public: trigger button + modal toggle
// ─────────────────────────────────────────────
export function AssigneePickerButton(props: Props) {
  const {
    value, valueMode = 'display_name', users, disabled,
    placeholder = '— 未指定（パトロール開始時に設定） —',
    className,
  } = props
  const [open, setOpen] = useState(false)

  const label = displayLabel(value, users, valueMode, placeholder)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          'flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-left text-sm shadow-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={cn(value ? 'text-foreground' : 'text-muted-foreground')}>
          {label}
        </span>
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <PickerModal
          {...props}
          onChange={(v) => { props.onChange(v); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function displayLabel(
  value: string,
  users: OrgUser[],
  valueMode: 'display_name' | 'id',
  placeholder: string,
): string {
  if (!value) return placeholder
  if (value === '__patroller_self__') return '🧍 パトロール実施者本人'
  if (valueMode === 'id') {
    const u = users.find((x) => x.id === value)
    return u?.display_name ?? value
  }
  return value
}

// ─────────────────────────────────────────────
// Modal v2 — 2-pane
// ─────────────────────────────────────────────
type Scope =
  | { kind: 'recent' }
  | { kind: 'favorites' }
  | { kind: 'mydept' }
  | { kind: 'orphans' }
  | { kind: 'roles' }
  | { kind: 'dept'; id: string }

type ModalProps = Props & {
  onClose: () => void
}

function PickerModal({
  value, onChange, onChangeRoleLabel, onClose,
  departments, users, workflowRoles = [],
  currentUserDeptId, currentUserId,
  valueMode = 'display_name',
  showSentinel = true,
  showRoles,
  storageKey = 'default',
}: ModalProps) {
  const showRolesResolved = (showRoles ?? (workflowRoles.length > 0)) && !!onChangeRoleLabel

  // ── localStorage: 直近選択 + お気に入り ──
  const recentKey   = `studio-picker-recent-${storageKey}`
  const favoriteKey = `studio-picker-favorites-${storageKey}`
  const [recents, setRecents]     = useState<string[]>([])  // 常に user.id を保持
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    try {
      const r = localStorage.getItem(recentKey)
      const f = localStorage.getItem(favoriteKey)
      if (r) setRecents(JSON.parse(r))
      if (f) setFavorites(JSON.parse(f))
    } catch { /* */ }
  }, [recentKey, favoriteKey])

  const addRecent = (userId: string) => {
    setRecents((prev) => {
      const next = [userId, ...prev.filter((x) => x !== userId)].slice(0, 5)
      try { localStorage.setItem(recentKey, JSON.stringify(next)) } catch { /* */ }
      return next
    })
  }
  const toggleFavorite = (userId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]
      try { localStorage.setItem(favoriteKey, JSON.stringify(next)) } catch { /* */ }
      return next
    })
  }

  // ── 自部署 (subtree) ──
  const myDeptIds = useMemo(
    () => collectSubtreeIds(departments, currentUserDeptId),
    [departments, currentUserDeptId],
  )
  const hasMyDept = myDeptIds.size > 0

  // ── 検索 + スコープ ──
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>(() =>
    hasMyDept ? { kind: 'mydept' } : { kind: 'recent' },
  )

  const q = query.trim().toLowerCase()
  const isSearching = q.length > 0

  // ── 部署ツリー (左ペイン用) ──
  const tree = useMemo(() => buildDeptTree(departments, users), [departments, users])
  const orphans = users.filter((u) => !u.department_id)

  // ── L1 部署の展開状態 ──
  const [expandedL1, setExpandedL1] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    // 自部署が含まれる L1 だけ default 展開
    for (const n of tree) {
      const inMyDept = collectAllIds(n).some((id) => myDeptIds.has(id))
      init[n.dept.id] = inMyDept
    }
    return init
  })
  const toggleL1 = (id: string) => setExpandedL1((p) => ({ ...p, [id]: !p[id] }))

  const [rolesExpanded, setRolesExpanded] = useState(false)

  // ── モバイル対応 ──
  const [isMobile, setIsMobile] = useState(false)
  const [mobilePane, setMobilePane] = useState<'nav' | 'list'>('nav')
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // ── 右ペインに表示するユーザー (スコープ別 + 検索) ──
  const visibleUsers = useMemo(() => {
    if (isSearching) {
      return users.filter((u) =>
        u.display_name.toLowerCase().includes(q)
        || (deptPath(departments, u.department_id) ?? '').toLowerCase().includes(q),
      )
    }
    switch (scope.kind) {
      case 'recent':
        return recents.map((id) => users.find((u) => u.id === id)).filter(isUser)
      case 'favorites':
        return favorites.map((id) => users.find((u) => u.id === id)).filter(isUser)
      case 'mydept':
        return users.filter((u) => u.department_id && myDeptIds.has(u.department_id))
      case 'orphans':
        return orphans
      case 'dept':
        return collectUsersInSubtree(tree, scope.id, users)
      case 'roles':
        return []
    }
  }, [isSearching, q, scope, users, departments, recents, favorites, myDeptIds, orphans, tree])

  const visibleRoles = useMemo(() => {
    if (!showRolesResolved) return []
    if (isSearching) return workflowRoles.filter((r) => r.label.toLowerCase().includes(q))
    if (scope.kind === 'roles') return workflowRoles
    return []
  }, [isSearching, q, scope, workflowRoles, showRolesResolved])

  // ── 役職順ソート ──
  const sortedUsers = useMemo(() => sortByRolePriority(visibleUsers), [visibleUsers])

  // ── キーボードナビゲーション ──
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const itemCount = sortedUsers.length + visibleRoles.length
  useEffect(() => { setFocusedIndex(-1) }, [scope, q])

  const inputRef = useRef<HTMLInputElement>(null)
  const rightListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 開いた瞬間に「現在選択中」の人を右ペインで visible にする
  useEffect(() => {
    if (!value || value === '__patroller_self__') return
    if (!rightListRef.current) return
    const el = rightListRef.current.querySelector(`[data-row-selected="true"]`) as HTMLElement | null
    if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' })
  }, [scope])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, itemCount - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        if (focusedIndex < 0) return
        e.preventDefault()
        if (focusedIndex < sortedUsers.length) {
          pickUser(sortedUsers[focusedIndex])
        } else {
          const r = visibleRoles[focusedIndex - sortedUsers.length]
          if (r) pickRole(r)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusedIndex, itemCount, sortedUsers, visibleRoles, onClose])

  // フォーカス変更時に該当行を可視範囲に
  useEffect(() => {
    if (focusedIndex < 0 || !rightListRef.current) return
    const rows = rightListRef.current.querySelectorAll('[data-row]')
    const el = rows[focusedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex])

  // ── 確定アクション ──
  const userValue = (u: OrgUser) => valueMode === 'id' ? u.id : u.display_name
  const isSelected = (u: OrgUser) => value === userValue(u)

  const pickUser = (u: OrgUser) => {
    addRecent(u.id)
    onChangeRoleLabel?.('')
    onChange(userValue(u))
  }
  const pickRole = (r: WorkflowRole) => {
    onChange('')
    onChangeRoleLabel?.(r.label)
    onClose()
  }
  const pickSentinel = (v: '' | '__patroller_self__') => {
    onChangeRoleLabel?.('')
    onChange(v)
  }
  const pickSelf = () => {
    if (!currentUserId) return
    const u = users.find((x) => x.id === currentUserId)
    if (u) pickUser(u)
  }

  // ── 左ペインの選択状態判定 ──
  const isScopeActive = (s: Scope) => {
    if (isSearching) return false
    if (s.kind === scope.kind) {
      if (s.kind === 'dept' && scope.kind === 'dept') return s.id === scope.id
      return true
    }
    return false
  }

  const onSelectScope = (s: Scope) => {
    setScope(s)
    setQuery('')
    if (isMobile) setMobilePane('list')
  }

  // ──────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex w-full max-w-4xl flex-col rounded-lg border bg-background shadow-xl"
        style={{ height: 'min(85vh, 720px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {isMobile && mobilePane === 'list' && (
              <button onClick={() => setMobilePane('nav')} className="p-1 -ml-1" aria-label="戻る">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            担当者を選択
          </h2>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} aria-label="閉じる">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="検索 (名前 / 部署 / 役割)"
              className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Body: 2-pane */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── 左ペイン (ナビゲーション) ── */}
          {(!isMobile || mobilePane === 'nav') && (
            <nav className={cn(
              'overflow-y-auto border-r bg-muted/30 p-2',
              isMobile ? 'w-full' : 'w-60',
            )}>
              {/* 🙋 自分 (即選択) */}
              {currentUserId && showSentinel && (
                <NavItem
                  icon={<span>🙋</span>}
                  label={`自分 (${users.find((u) => u.id === currentUserId)?.display_name ?? '?'})`}
                  hint="即選択"
                  onClick={pickSelf}
                />
              )}

              {/* 🧍 sentinel */}
              {showSentinel && (
                <NavItem
                  icon={<span>🧍</span>}
                  label="パトロール者本人"
                  hint="提出者に自動回付"
                  active={value === '__patroller_self__'}
                  onClick={() => pickSentinel('__patroller_self__')}
                />
              )}

              {/* 未指定 */}
              <NavItem
                icon={<span>—</span>}
                label="未指定"
                hint="提出フェーズで決定"
                active={!value && !isScopeActive({ kind: 'recent' })}
                onClick={() => pickSentinel('')}
              />

              <div className="my-2 border-t" />

              {/* ⏱ 最近 */}
              <NavItem
                icon={<span>⏱</span>}
                label="最近選んだ"
                badge={recents.length}
                active={isScopeActive({ kind: 'recent' })}
                onClick={() => onSelectScope({ kind: 'recent' })}
                disabled={recents.length === 0}
              />
              {/* ⭐ お気に入り */}
              <NavItem
                icon={<span>⭐</span>}
                label="お気に入り"
                badge={favorites.length}
                active={isScopeActive({ kind: 'favorites' })}
                onClick={() => onSelectScope({ kind: 'favorites' })}
                disabled={favorites.length === 0}
              />
              {/* 📌 自部署 */}
              {hasMyDept && (
                <NavItem
                  icon={<span>📌</span>}
                  label="自部署"
                  badge={users.filter((u) => u.department_id && myDeptIds.has(u.department_id)).length}
                  active={isScopeActive({ kind: 'mydept' })}
                  onClick={() => onSelectScope({ kind: 'mydept' })}
                  highlight
                />
              )}

              <div className="my-2 border-t" />

              {/* 部署ツリー (本部 → 部 → 班) */}
              {tree.map((node) => (
                <DeptNavBranch
                  key={node.dept.id}
                  node={node}
                  depth={0}
                  expanded={expandedL1[node.dept.id] ?? false}
                  onToggle={() => toggleL1(node.dept.id)}
                  isActive={(id) => isScopeActive({ kind: 'dept', id })}
                  onSelect={(id) => onSelectScope({ kind: 'dept', id })}
                />
              ))}

              {/* 👑 組織管理者 (orphans) */}
              {orphans.length > 0 && (
                <NavItem
                  icon={<span>👑</span>}
                  label="組織管理者"
                  badge={orphans.length}
                  active={isScopeActive({ kind: 'orphans' })}
                  onClick={() => onSelectScope({ kind: 'orphans' })}
                />
              )}

              {/* 🎭 役割 */}
              {showRolesResolved && (
                <>
                  <div className="my-2 border-t" />
                  <NavItem
                    icon={<span>🎭</span>}
                    label="役割で選ぶ"
                    badge={workflowRoles.length}
                    active={isScopeActive({ kind: 'roles' })}
                    onClick={() => {
                      setRolesExpanded(true)
                      onSelectScope({ kind: 'roles' })
                    }}
                  />
                </>
              )}
            </nav>
          )}

          {/* ── 右ペイン (一覧) ── */}
          {(!isMobile || mobilePane === 'list') && (
            <div ref={rightListRef} className="flex-1 overflow-y-auto p-3">
              <RightHeader
                isSearching={isSearching}
                query={query}
                scope={scope}
                hits={sortedUsers.length + visibleRoles.length}
                departments={departments}
                workflowRoles={workflowRoles}
              />

              {/* 役割で選ぶ — scope='roles' or search */}
              {(scope.kind === 'roles' || isSearching) && visibleRoles.length > 0 && (
                <div className="mb-2">
                  {visibleRoles.map((r, i) => {
                    const idx = sortedUsers.length + i
                    return (
                      <RoleRow
                        key={r.key}
                        role={r}
                        focused={focusedIndex === idx}
                        query={q}
                        onClick={() => pickRole(r)}
                        onMouseEnter={() => setFocusedIndex(idx)}
                      />
                    )
                  })}
                </div>
              )}

              {/* ユーザー一覧 */}
              {sortedUsers.length === 0 && visibleRoles.length === 0 ? (
                <EmptyState scope={scope} isSearching={isSearching} query={query} />
              ) : (
                sortedUsers.map((u, i) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    selected={isSelected(u)}
                    focused={focusedIndex === i}
                    pinned={favorites.includes(u.id)}
                    deptPath={deptPath(departments, u.department_id)}
                    query={q}
                    onPick={() => pickUser(u)}
                    onTogglePin={() => toggleFavorite(u.id)}
                    onMouseEnter={() => setFocusedIndex(i)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t px-4 py-2 text-[10px] text-muted-foreground">
          ↓↑ 移動 ／ Enter 選択 ／ Esc 閉じる ／ ⭐ ピン留め ／ 検索は名前・部署・役割を横断
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─────────────────────────────────────────────
// 左ペイン: ナビアイテム + 部署ブランチ
// ─────────────────────────────────────────────
function NavItem({
  icon, label, hint, badge, active, highlight, disabled, onClick,
}: {
  icon:      React.ReactNode
  label:     string
  hint?:     string
  badge?:    number
  active?:   boolean
  highlight?: boolean
  disabled?: boolean
  onClick:   () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={cn(
        'flex w-full items-center justify-between gap-1.5 rounded px-2 py-1.5 text-left text-xs',
        'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40',
        active && 'bg-primary/10 font-medium text-primary',
        highlight && !active && 'text-emerald-700 dark:text-emerald-400',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <span className="shrink-0 text-sm">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {badge !== undefined && (
        <span className="shrink-0 text-[10px] text-muted-foreground">{badge}</span>
      )}
    </button>
  )
}

function DeptNavBranch({
  node, depth, expanded, onToggle, isActive, onSelect,
}: {
  node:     DeptNode
  depth:    number
  expanded: boolean
  onToggle: () => void
  isActive: (id: string) => boolean
  onSelect: (id: string) => void
}) {
  const hasChildren = node.children.length > 0
  if (node.total === 0) return null

  return (
    <div>
      <div className="flex items-center gap-0.5">
        {hasChildren && depth === 0 ? (
          <button
            type="button"
            onClick={onToggle}
            className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="展開"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span style={{ width: 18 }} />
        )}
        <NavItem
          icon={<span>{iconForDept(node.dept.name)}</span>}
          label={node.dept.name}
          badge={node.total}
          active={isActive(node.dept.id)}
          onClick={() => onSelect(node.dept.id)}
        />
      </div>
      {hasChildren && (depth > 0 || expanded) && (
        <div style={{ marginLeft: depth === 0 ? 18 : 12 }}>
          {node.children.map((c) => (
            <DeptNavBranch
              key={c.dept.id}
              node={c}
              depth={depth + 1}
              expanded={true}
              onToggle={() => {}}
              isActive={isActive}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 右ペイン: ヘッダ / ユーザー行 / ロール行 / 空状態
// ─────────────────────────────────────────────
function RightHeader({
  isSearching, query, scope, hits, departments, workflowRoles,
}: {
  isSearching: boolean
  query:       string
  scope:       Scope
  hits:        number
  departments: Department[]
  workflowRoles: WorkflowRole[]
}) {
  let title = ''
  if (isSearching) {
    title = `🔎 検索: 「${query}」 (${hits})`
  } else {
    switch (scope.kind) {
      case 'recent':    title = '⏱ 最近選んだユーザー'; break
      case 'favorites': title = '⭐ お気に入り'; break
      case 'mydept':    title = '📌 自部署のメンバー'; break
      case 'orphans':   title = '👑 組織管理者 (部署無所属)'; break
      case 'roles':     title = `🎭 役割 (${workflowRoles.length})`; break
      case 'dept': {
        const d = departments.find((x) => x.id === scope.id)
        title = `${iconForDept(d?.name ?? '')} ${d?.name ?? ''} (${hits})`
        break
      }
    }
  }
  return (
    <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">{title}</div>
  )
}

function UserRow({
  user, selected, focused, pinned, deptPath, query, onPick, onTogglePin, onMouseEnter,
}: {
  user:        OrgUser
  selected:    boolean
  focused:     boolean
  pinned:      boolean
  deptPath:    string | null
  query:       string
  onPick:      () => void
  onTogglePin: () => void
  onMouseEnter: () => void
}) {
  const color = avatarColor(user.department_id)
  return (
    <div
      data-row
      data-row-selected={selected}
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer',
        focused && 'bg-accent',
        selected && 'bg-primary/10',
      )}
      onClick={onPick}
      title={deptPath ?? '部署無所属'}
    >
      {/* Avatar (initial + dept color) */}
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ background: color.bg }}
      >
        {initial(user.display_name)}
      </div>
      {/* Name + dept */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          <Highlighted text={user.display_name} q={query} />
        </div>
        {deptPath && (
          <div className="truncate text-[10px] text-muted-foreground">
            <Highlighted text={deptPath} q={query} />
          </div>
        )}
      </div>
      {/* Selected check */}
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
      {/* Pin */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onTogglePin() }}
        className={cn(
          'shrink-0 rounded p-1 text-muted-foreground hover:bg-muted',
          pinned && 'text-amber-500',
        )}
        title={pinned ? 'お気に入り解除' : 'お気に入り'}
      >
        <Star className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
      </button>
    </div>
  )
}

function RoleRow({
  role, focused, query, onClick, onMouseEnter,
}: {
  role:    WorkflowRole
  focused: boolean
  query:   string
  onClick: () => void
  onMouseEnter: () => void
}) {
  return (
    <div
      data-row
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer',
        focused && 'bg-accent',
      )}
      onClick={onClick}
      title="役割としてセット (binding 経由で実ユーザーが解決される)"
    >
      <span className="text-sm">🎭</span>
      <div className="min-w-0 flex-1 truncate text-sm font-medium">
        <Highlighted text={role.label} q={query} />
      </div>
      <span className="text-[10px] text-muted-foreground">役割</span>
    </div>
  )
}

function EmptyState({ scope, isSearching, query }: {
  scope: Scope; isSearching: boolean; query: string
}) {
  let msg: React.ReactNode = '該当するユーザーがいません'
  if (isSearching) msg = <>「<strong>{query}</strong>」に一致する候補が見つかりません</>
  else if (scope.kind === 'recent')    msg = '最近選んだユーザーはまだありません。一度選択するとここに履歴が残ります。'
  else if (scope.kind === 'favorites') msg = 'お気に入りに登録したユーザーはまだありません。⭐ ボタンで登録できます。'
  return <p className="py-12 text-center text-xs text-muted-foreground">{msg}</p>
}

function Highlighted({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q)
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-200 px-0.5 dark:bg-amber-900/60">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

// ─────────────────────────────────────────────
// 部署ツリーヘルパー
// ─────────────────────────────────────────────
type DeptNode = {
  dept:     Department
  users:    OrgUser[]
  children: DeptNode[]
  total:    number
}

function buildDeptTree(departments: Department[], users: OrgUser[]): DeptNode[] {
  const byParent = new Map<string | null, Department[]>()
  for (const d of departments) {
    const arr = byParent.get(d.parent_id) ?? []
    arr.push(d); byParent.set(d.parent_id, arr)
  }
  const usersByDept = new Map<string, OrgUser[]>()
  for (const u of users) {
    if (!u.department_id) continue
    const arr = usersByDept.get(u.department_id) ?? []
    arr.push(u); usersByDept.set(u.department_id, arr)
  }
  const build = (d: Department): DeptNode => {
    const children = (byParent.get(d.id) ?? []).map(build)
    const direct   = usersByDept.get(d.id) ?? []
    return { dept: d, users: direct, children, total: direct.length + children.reduce((s, c) => s + c.total, 0) }
  }
  return (byParent.get(null) ?? []).map(build)
}

function collectAllIds(node: DeptNode): string[] {
  return [node.dept.id, ...node.children.flatMap(collectAllIds)]
}

function collectSubtreeIds(departments: Department[], rootId: string | null): Set<string> {
  const result = new Set<string>()
  if (!rootId) return result
  const byParent = new Map<string | null, Department[]>()
  for (const d of departments) {
    const arr = byParent.get(d.parent_id) ?? []
    arr.push(d); byParent.set(d.parent_id, arr)
  }
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()!
    result.add(id)
    for (const c of byParent.get(id) ?? []) stack.push(c.id)
  }
  return result
}

function findNode(nodes: DeptNode[], id: string): DeptNode | null {
  for (const n of nodes) {
    if (n.dept.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

function collectUsersInSubtree(tree: DeptNode[], deptId: string, allUsers: OrgUser[]): OrgUser[] {
  const node = findNode(tree, deptId)
  if (!node) return []
  const ids = new Set(collectAllIds(node))
  return allUsers.filter((u) => u.department_id && ids.has(u.department_id))
}

function deptPath(departments: Department[], deptId: string | null): string | null {
  if (!deptId) return null
  const byId = new Map(departments.map((d) => [d.id, d]))
  const parts: string[] = []
  let cur = byId.get(deptId)
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
  }
  return parts.join(' / ')
}

function isUser(u: OrgUser | undefined): u is OrgUser {
  return !!u
}

// ─────────────────────────────────────────────
// 表示まわりヘルパー
// ─────────────────────────────────────────────
function iconForDept(name: string): string {
  if (name.includes('営業'))                 return '🏢'
  if (name.includes('開発'))                 return '🛠'
  if (name.includes('管理') || name.includes('総務')) return '📋'
  return '🏬'
}

function initial(name: string): string {
  return name.trim().charAt(0) || '?'
}

const PALETTE = [
  { bg: '#10b981' }, // emerald
  { bg: '#06b6d4' }, // cyan
  { bg: '#f59e0b' }, // amber
  { bg: '#f43f5e' }, // rose
  { bg: '#8b5cf6' }, // violet
  { bg: '#3b82f6' }, // blue
  { bg: '#f97316' }, // orange
  { bg: '#ec4899' }, // pink
] as const

function avatarColor(deptId: string | null): { bg: string } {
  if (!deptId) return { bg: '#64748b' }  // slate for orphans
  let h = 0
  for (let i = 0; i < deptId.length; i++) h = (h * 31 + deptId.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function sortByRolePriority(users: OrgUser[]): OrgUser[] {
  return [...users].sort((a, b) => {
    const ra = roleRank(a.display_name)
    const rb = roleRank(b.display_name)
    if (ra !== rb) return ra - rb
    return a.display_name.localeCompare(b.display_name, 'ja')
  })
}

function roleRank(name: string): number {
  if (name.includes('本部長') || name.includes('org-admin')) return 0
  if (name.includes('部長')) return 1
  if (name.includes('班長')) return 2
  if (name.includes('長'))   return 3
  return 4
}
