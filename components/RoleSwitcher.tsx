'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, User } from 'lucide-react'
import { useStudioStore, STUDIO_USER_COOKIE, getDepartmentPath } from '@/lib/sdk-mock/store'
import { useRouter } from 'next/navigation'

function setUserCookie(id: string) {
  document.cookie = `${STUDIO_USER_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`
}

const ALL_DEPTS = '__all__'
const NO_DEPT   = '__none__'

/**
 * 仮ユーザー切替（プレビュー時のロール検証用）。
 * 部署フィルタ → ユーザー選択 の 2 段階で 30+ 人から選びやすくする。
 */
export function RoleSwitcher() {
  const org           = useStudioStore((s) => s.org)
  const departments   = useStudioStore((s) => s.departments)
  const users         = useStudioStore((s) => s.users)
  const currentUserId = useStudioStore((s) => s.currentUserId)
  const setCurrentUser = useStudioStore((s) => s.setCurrentUser)
  const router = useRouter()

  const [filterDeptId, setFilterDeptId] = useState<string>(ALL_DEPTS)

  // SSR では cookie を読めず初期 currentUserId が DEFAULT_USERS[0] になる。
  // クライアントでハイドレーション時に cookie 由来のユーザーが入って
  // 表示テキストが食い違う → hydration mismatch エラーを防ぐため
  // mounted まで描画しない。
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => { setUserCookie(currentUserId) }, [currentUserId])

  const onChangeUser = (id: string) => {
    setCurrentUser(id)
    setUserCookie(id)
    router.refresh()
  }

  const current = users.find((u) => u.id === currentUserId) ?? users[0]
  const currentDeptPath = getDepartmentPath(current.departmentId)

  // 現在のユーザーの部署にフィルタを自動セット（初回のみ）
  useEffect(() => {
    if (filterDeptId === ALL_DEPTS && current.departmentId) {
      setFilterDeptId(current.departmentId)
    }
  }, [current.departmentId, filterDeptId])

  const filteredUsers = useMemo(() => {
    if (filterDeptId === ALL_DEPTS) return users
    if (filterDeptId === NO_DEPT)   return users.filter((u) => u.departmentId === null)
    return users.filter((u) => u.departmentId === filterDeptId)
  }, [users, filterDeptId])

  if (!mounted) {
    // SSR / 初期描画は静的なプレースホルダ (hydration 安全)
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{org.name}</span>
        </div>
        <div className="text-[10px]">読込中…</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 text-xs">
      {/* 組織 */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Building2 className="h-3 w-3 shrink-0" />
        <span className="truncate" title={org.slug}>{org.name}</span>
      </div>

      {/* 部署フィルタ */}
      <div className="space-y-1">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <span>部署</span>
        </label>
        <select
          value={filterDeptId}
          onChange={(e) => setFilterDeptId(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value={ALL_DEPTS}>（全部署）</option>
          <option value={NO_DEPT}>（部署なし - 全社）</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {indent(d, departments)}{d.name}
            </option>
          ))}
        </select>
      </div>

      {/* ユーザー */}
      <div className="space-y-1">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <User className="h-3 w-3 shrink-0" />
          <span>仮ユーザー（{filteredUsers.length}）</span>
        </label>
        <select
          value={filteredUsers.some((u) => u.id === currentUserId) ? currentUserId : filteredUsers[0]?.id ?? currentUserId}
          onChange={(e) => onChangeUser(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {filteredUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.actorName}（{u.orgRole}）
            </option>
          ))}
        </select>
      </div>

      {/* 現在のユーザー詳細 */}
      <div className="text-[10px] text-muted-foreground space-y-0.5">
        <div>
          ロール: <span className="font-mono text-amber-600">{current.orgRole}</span>
        </div>
        {currentDeptPath && (
          <div className="truncate" title={currentDeptPath}>
            所属: <span className="text-foreground">{currentDeptPath}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** ツリー階層に応じてインデント文字列を返す */
function indent(d: { parentId: string | null }, all: Array<{ id: string; parentId: string | null }>): string {
  let depth = 0
  let cur: typeof d | undefined = d
  while (cur?.parentId) {
    depth++
    cur = all.find((x) => x.id === cur!.parentId)
  }
  return '　'.repeat(depth)
}
