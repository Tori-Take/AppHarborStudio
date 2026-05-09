'use client'

import { Building2, Users, GitBranch } from 'lucide-react'
import { useStudioStore } from '@/lib/sdk-mock/store'
import type { MockDepartment, MockUser } from '@/lib/sdk-mock/types'
import { BrandAssets } from '@/components/brand/BrandAssets'

export default function SettingsPage() {
  const org         = useStudioStore((s) => s.org)
  const departments = useStudioStore((s) => s.departments)
  const users       = useStudioStore((s) => s.users)

  // 部署 ID → 所属ユーザー一覧
  const usersByDept = new Map<string | null, MockUser[]>()
  for (const u of users) {
    const arr = usersByDept.get(u.departmentId) ?? []
    arr.push(u)
    usersByDept.set(u.departmentId, arr)
  }

  // ルート部署（parentId が null）
  const roots = departments.filter((d) => d.parentId === null)

  return (
    <div className="p-8">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Studio Sandbox 組織の構造とユーザー一覧を表示します（読み取り専用）。
        </p>
      </div>

      {/* 組織情報 */}
      <section className="mb-6 rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">組織情報</h2>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">組織名</span>
            <p className="font-medium">{org.name}</p>
          </div>
          <div>
            <span className="text-muted-foreground">slug</span>
            <p className="font-mono text-amber-700">{org.slug}</p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">UUID</span>
            <p className="font-mono text-xs text-muted-foreground">{org.id}</p>
          </div>
        </div>
      </section>

      {/* 部署ツリー */}
      <section className="mb-6 rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            部署ツリー（{departments.length}）
          </h2>
        </div>
        <ul className="space-y-1 text-sm">
          {roots.map((root) => (
            <DeptNode key={root.id} dept={root} all={departments} usersByDept={usersByDept} depth={0} />
          ))}
        </ul>
      </section>

      {/* ユーザー一覧 */}
      <section className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            ユーザー（{users.length}）
          </h2>
        </div>

        {/* 部署なし（全社） */}
        {(usersByDept.get(null)?.length ?? 0) > 0 && (
          <div className="mb-4">
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">部署なし（全社）</h3>
            <UserList users={usersByDept.get(null) ?? []} />
          </div>
        )}

        {/* 各部署のユーザー */}
        {departments.map((d) => {
          const list = usersByDept.get(d.id) ?? []
          if (list.length === 0) return null
          return (
            <div key={d.id} className="mb-4 last:mb-0">
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                {breadcrumb(d, departments)}
              </h3>
              <UserList users={list} />
            </div>
          )
        })}
      </section>

      {/* ブランドアセット */}
      <section className="mt-8">
        <BrandAssets />
      </section>
    </div>
  )
}

function DeptNode({
  dept, all, usersByDept, depth,
}: {
  dept:        MockDepartment
  all:         MockDepartment[]
  usersByDept: Map<string | null, MockUser[]>
  depth:       number
}) {
  const children = all.filter((d) => d.parentId === dept.id)
  const userCount = usersByDept.get(dept.id)?.length ?? 0
  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/50"
        style={{ paddingLeft: 8 + depth * 20 }}
      >
        <span className="text-muted-foreground">{depth === 0 ? '▣' : depth === 1 ? '▸' : '·'}</span>
        <span className="font-medium">{dept.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {userCount} 人
        </span>
      </div>
      {children.length > 0 && (
        <ul className="space-y-1">
          {children.map((c) => (
            <DeptNode key={c.id} dept={c} all={all} usersByDept={usersByDept} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function UserList({ users }: { users: MockUser[] }) {
  return (
    <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((u) => (
        <li key={u.id} className="flex items-center justify-between rounded-md border bg-background px-3 py-1.5 text-sm">
          <span className="truncate">{u.actorName}</span>
          <span
            className={
              u.orgRole === 'org-admin'  ? 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700' :
              u.orgRole === 'dept-admin' ? 'rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700' :
              'rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground'
            }
          >
            {u.orgRole}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** 「営業本部 / 国内営業部」のようなパス文字列を返す */
function breadcrumb(d: MockDepartment, all: MockDepartment[]): string {
  const parts: string[] = []
  let cur: MockDepartment | undefined = d
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parentId ? all.find((x) => x.id === cur!.parentId) : undefined
  }
  return parts.join(' / ')
}
