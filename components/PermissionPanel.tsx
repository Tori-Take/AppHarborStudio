'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useStudioStore, STUDIO_USER_COOKIE } from '@/lib/sdk-mock/store'
import type { MockUser, MockDepartment } from '@/lib/sdk-mock/types'
import { LintMiniPanel } from './LintMiniPanel'

function setUserCookie(id: string) {
  document.cookie = `${STUDIO_USER_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`
}

type PermissionDef = {
  id:           string
  label?:       string
  description?: string
  default?:     boolean
}

type Manifest = {
  id?:           string
  name?:         string
  permissions?:  PermissionDef[] | string[]
}

type DeptNode = {
  dept:     MockDepartment
  users:    MockUser[]   // この部署直属のユーザー
  children: DeptNode[]   // 直下のサブ部署
  total:    number       // 子孫含む総ユーザー数
}

const COLLAPSE_KEY = 'studio-permpanel-collapsed-l1'

export function PermissionPanel() {
  const pathname = usePathname() ?? ''
  const m = pathname.match(/^\/org\/([^/]+)\/apps\/([^/?]+)/)
  const cartridgeId = m?.[2]

  const [manifest, setManifest] = useState<Manifest | null>(null)
  // file-backed override map: { [appId]: { [userId]: roleId } }
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({})

  const reloadOverrides = () => {
    fetch('/api/app-permissions')
      .then((r) => r.ok ? r.json() : {})
      .then(setOverrides)
      .catch(() => setOverrides({}))
  }

  useEffect(() => {
    if (!cartridgeId) { setManifest(null); return }
    fetch(`/api/cartridges/${encodeURIComponent(cartridgeId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setManifest)
      .catch(() => setManifest(null))
    reloadOverrides()
  }, [cartridgeId])

  const users         = useStudioStore((s) => s.users)
  const departments   = useStudioStore((s) => s.departments)
  const currentUserId = useStudioStore((s) => s.currentUserId)
  const setCurrentUser  = useStudioStore((s) => s.setCurrentUser)

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // L1 部署の折り畳み状態 (localStorage 永続)
  const [collapsedL1, setCollapsedL1] = useState<Record<string, boolean>>({})
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY)
      if (raw) setCollapsedL1(JSON.parse(raw))
    } catch { /* noop */ }
  }, [])
  const toggleL1 = (deptId: string) => {
    setCollapsedL1((prev) => {
      const next = { ...prev, [deptId]: !prev[deptId] }
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }

  const onSwitchUser = (id: string) => {
    setCurrentUser(id)
    setUserCookie(id)
    window.location.reload()
  }
  const onSetAppRole = async (userId: string, appId: string, role: string) => {
    setOverrides((prev) => {
      const next = { ...prev }
      const m = { ...(next[appId] ?? {}) }
      if (role === '') delete m[userId]; else m[userId] = role
      next[appId] = m
      return next
    })
    await fetch('/api/app-permissions', {
      method:  'PUT',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ appId, userId, role: role || null }),
    })
    if (userId === currentUserId) {
      window.location.reload()
    }
  }

  const onResetApp = async () => {
    if (!cartridgeId) return
    if (!confirm(`${cartridgeId} のロール設定をリセットしますか？\n（次回「Studio で起動」で田中=admin に戻ります）`)) return
    await fetch(`/api/app-permissions/${encodeURIComponent(cartridgeId)}`, { method: 'DELETE' })
    reloadOverrides()
    window.location.reload()
  }

  // 部署ツリー構築 (Level 1 ルート → 子 → 孫 を再帰、各ノードに直属ユーザーを紐づけ)
  const { tree, orphans } = useMemo(() => {
    return buildDeptTree(departments, users)
  }, [departments, users])

  if (!cartridgeId) return null

  const perms = normalizePerms(manifest?.permissions)
  const defaultPerm = perms.find((p) => p.default)
  const defaultRoleId = defaultPerm?.id ?? 'member'
  const currentUser = users.find((u) => u.id === currentUserId)

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        background: '#0b1322',
        borderLeft: '1px solid #334155',
        padding: 16,
        height: '100%',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        fontSize: 13,
      }}
    >
      <LintMiniPanel />

      <h3 style={{ margin: '0 0 4px', fontSize: 13, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        🔐 アプリ権限
      </h3>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>{cartridgeId}</div>

      {perms.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 12 }}>
          このカートリッジには permissions 定義がありません
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>定義されているロール</div>
          {perms.map((p) => (
            <div key={p.id} style={{ marginBottom: 6, fontSize: 12 }}>
              <code style={{ color: '#fbbf24' }}>{p.id}</code>
              {p.label && <span style={{ color: '#94a3b8' }}> — {p.label}</span>}
              {p.default && <span style={{ marginLeft: 6, fontSize: 10, color: '#10b981' }}>(default)</span>}
            </div>
          ))}
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '12px 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>ユーザー別ロール割当て</div>
        <button
          onClick={onResetApp}
          title="このアプリのロール上書きを全削除（田中=admin に戻る）"
          style={{
            background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
            borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer',
          }}
        >🧹 リセット</button>
      </div>

      {!mounted ? (
        <div style={{ fontSize: 11, color: '#64748b', padding: '12px 0', textAlign: 'center' }}>
          読込中…
        </div>
      ) : (
        <>
          {/* 組織管理者 (部署無所属) */}
          {orphans.length > 0 && (
            <DeptSection
              icon="👑"
              title="組織管理者"
              count={orphans.length}
              collapsed={!!collapsedL1['__orphans__']}
              onToggle={() => toggleL1('__orphans__')}
            >
              {orphans.map((u) => (
                <UserRow
                  key={u.id} user={u} cartridgeId={cartridgeId} perms={perms}
                  defaultRoleId={defaultRoleId}
                  assigned={overrides[cartridgeId]?.[u.id] ?? ''}
                  isCurrent={u.id === currentUserId}
                  onSwitch={onSwitchUser} onSetRole={onSetAppRole}
                />
              ))}
            </DeptSection>
          )}

          {/* 各 Level 1 本部 */}
          {tree.map((node) => (
            <DeptSection
              key={node.dept.id}
              icon={iconForDept(node.dept.name)}
              title={node.dept.name}
              count={node.total}
              collapsed={!!collapsedL1[node.dept.id]}
              onToggle={() => toggleL1(node.dept.id)}
            >
              <DeptTree
                node={node} depth={0}
                cartridgeId={cartridgeId} perms={perms}
                defaultRoleId={defaultRoleId}
                overrides={overrides[cartridgeId] ?? {}}
                currentUserId={currentUserId}
                onSwitch={onSwitchUser} onSetRole={onSetAppRole}
              />
            </DeptSection>
          ))}
        </>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '12px 0' }} />

      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
        {mounted && (
          <>
            現在: <strong style={{ color: '#fbbf24' }}>{currentUser?.actorName}</strong>
            <br />
          </>
        )}
        切替・ロール変更は自動でページがリロードされます。
      </div>
    </aside>
  )
}

// ── 部署ツリーのレンダ (再帰) ─────────────────────────────────
function DeptTree({
  node, depth, cartridgeId, perms, defaultRoleId, overrides,
  currentUserId, onSwitch, onSetRole,
}: {
  node:           DeptNode
  depth:          number
  cartridgeId:    string
  perms:          PermissionDef[]
  defaultRoleId:  string
  overrides:      Record<string, string>
  currentUserId:  string
  onSwitch:       (id: string) => void
  onSetRole:      (uid: string, appId: string, role: string) => void
}) {
  return (
    <>
      {/* 直属ユーザー */}
      {node.users.map((u) => (
        <UserRow
          key={u.id} user={u} cartridgeId={cartridgeId} perms={perms}
          defaultRoleId={defaultRoleId}
          assigned={overrides[u.id] ?? ''}
          isCurrent={u.id === currentUserId}
          onSwitch={onSwitch} onSetRole={onSetRole}
        />
      ))}

      {/* 子部署 (sub-header + 再帰) */}
      {node.children.map((child) => (
        <div key={child.dept.id} style={{
          borderLeft: '2px solid rgba(103, 232, 249, 0.25)', paddingLeft: 8,
          marginLeft: depth > 0 ? 4 : 0, marginTop: 6, marginBottom: 4,
        }}>
          <div style={{
            fontSize: 11, marginBottom: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: '#67e8f9', fontWeight: 600 }}>└ {child.dept.name}</span>
            <span style={{ fontSize: 10, color: '#a5f3fc' }}>{child.total}</span>
          </div>
          <DeptTree
            node={child} depth={depth + 1}
            cartridgeId={cartridgeId} perms={perms}
            defaultRoleId={defaultRoleId} overrides={overrides}
            currentUserId={currentUserId}
            onSwitch={onSwitch} onSetRole={onSetRole}
          />
        </div>
      ))}
    </>
  )
}

// ── 折り畳み可能な L1 セクション ──────────────────────────────
function DeptSection({
  icon, title, count, collapsed, onToggle, children,
}: {
  icon:      string
  title:     string
  count:     number
  collapsed: boolean
  onToggle:  () => void
  children:  React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 6, padding: '4px 6px',
          background: 'rgba(52, 211, 153, 0.08)',
          border: '1px solid rgba(52, 211, 153, 0.25)',
          borderRadius: 4, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', marginBottom: 6,
        }}
      >
        <span style={{ color: '#34d399' }}>
          <span style={{ marginRight: 4 }}>{collapsed ? '▶' : '▼'}</span>
          {icon} {title}
        </span>
        <span style={{ fontSize: 10, color: '#6ee7b7', fontWeight: 400 }}>{count} 名</span>
      </button>
      {!collapsed && <div style={{ paddingLeft: 2 }}>{children}</div>}
    </div>
  )
}

// ── ユーザー 1 行 ─────────────────────────────────────────────
function UserRow({
  user: u, cartridgeId, perms, defaultRoleId,
  assigned, isCurrent, onSwitch, onSetRole,
}: {
  user:           MockUser
  cartridgeId:    string
  perms:          PermissionDef[]
  defaultRoleId:  string
  assigned:       string
  isCurrent:      boolean
  onSwitch:       (id: string) => void
  onSetRole:      (uid: string, appId: string, role: string) => void
}) {
  return (
    <div
      style={{
        marginBottom: 6, padding: 6,
        background: isCurrent ? 'rgba(251, 191, 36, 0.14)' : 'transparent',
        border: isCurrent ? '1.5px solid #fbbf24' : '1px solid transparent',
        borderRadius: 6,
        boxShadow: isCurrent ? '0 0 0 2px rgba(251, 191, 36, 0.15)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 12, color: isCurrent ? '#fbbf24' : '#e2e8f0', fontWeight: isCurrent ? 600 : 400 }}>
          {isCurrent && <span style={{ marginRight: 4 }}>👤</span>}
          {u.actorName.replace(/（.*）/, '')}
          <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4, fontWeight: 400 }}>({u.orgRole})</span>
          {isCurrent && (
            <span style={{
              marginLeft: 6, fontSize: 9, color: '#0b1322', background: '#fbbf24',
              padding: '1px 5px', borderRadius: 3, fontWeight: 700, letterSpacing: 0.3,
            }}>LOGIN中</span>
          )}
        </span>
        {!isCurrent && (
          <button
            onClick={() => onSwitch(u.id)}
            style={{
              background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
              borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer',
            }}
          >切替</button>
        )}
      </div>
      <select
        value={assigned}
        onChange={(e) => onSetRole(u.id, cartridgeId, e.target.value)}
        style={{
          width: '100%', marginTop: 4, fontSize: 12,
          background: '#0f172a', color: '#e2e8f0',
          border: '1px solid #334155', borderRadius: 4, padding: '3px 6px',
        }}
      >
        <option value="">— 未設定（自動: {defaultRoleId}）</option>
        {perms.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id}{p.label ? ` (${p.label})` : ''}{p.default ? ' ⭐' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── ヘルパー ──────────────────────────────────────────────────
function buildDeptTree(
  departments: MockDepartment[],
  users:       MockUser[],
): { tree: DeptNode[]; orphans: MockUser[] } {
  const byParent = new Map<string | null, MockDepartment[]>()
  for (const d of departments) {
    const arr = byParent.get(d.parentId) ?? []
    arr.push(d)
    byParent.set(d.parentId, arr)
  }
  const usersByDept = new Map<string, MockUser[]>()
  const orphans: MockUser[] = []
  for (const u of users) {
    if (!u.departmentId) { orphans.push(u); continue }
    const arr = usersByDept.get(u.departmentId) ?? []
    arr.push(u)
    usersByDept.set(u.departmentId, arr)
  }

  const buildNode = (d: MockDepartment): DeptNode => {
    const childDepts = byParent.get(d.id) ?? []
    const children = childDepts.map(buildNode)
    const direct   = usersByDept.get(d.id) ?? []
    const total    = direct.length + children.reduce((s, c) => s + c.total, 0)
    return { dept: d, users: direct, children, total }
  }

  const roots = (byParent.get(null) ?? []).map(buildNode)
  return { tree: roots, orphans }
}

function iconForDept(name: string): string {
  if (name.includes('営業')) return '🏢'
  if (name.includes('開発')) return '🛠'
  if (name.includes('管理') || name.includes('総務')) return '📋'
  return '🏬'
}

function normalizePerms(p: Manifest['permissions']): PermissionDef[] {
  if (!p) return []
  if (Array.isArray(p) && p.length > 0 && typeof p[0] === 'string') {
    return (p as string[]).map((id) => ({ id }))
  }
  return p as PermissionDef[]
}
