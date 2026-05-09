import Link         from 'next/link'
import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout } from '../../patrol-layout'
import { Card, CardContent, CardHeader, CardTitle } from '../../_ui/card'
import { Button, buttonVariants } from '../../_ui/button'
import { Input } from '../../_ui/input'
import { Label } from '../../_ui/label'
import { cn } from '../../_ui/cn'
import { ArrowLeft, Plus, Trash2, Users, Lock } from 'lucide-react'
import { canManageTemplates } from '../../_helpers/patrolRole'
import {
  ensureSeedRolesAction,
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
  addBindingAction,
  removeBindingAction,
} from './actions'
import { SEED_ROLES } from './seed'

type Role = {
  id:          string
  key:         string
  label:       string
  description: string | null
  sort_order:  number
  is_system:   boolean
}

type Binding = {
  id:           string
  role_id:      string
  user_id:      string
  display_name: string | null
}

type Profile = {
  id:           string
  display_name: string | null
}

export default async function RolesPage({
  params,
}: {
  params: Promise<{ slug: string; appId?: string }>
}) {
  const { slug } = await params

  const ctx = await requireApp(slug, 'patrol-navi', canManageTemplates)
  const orgId = ctx.actor.organizationId
  const supabase = getAdminSupabase()

  // 初回アクセス時に seed（render 中は revalidatePath を呼べないので直接 insert する）
  const { data: existingRoles } = await supabase
    .from('patrol_workflow_roles')
    .select('id')
    .eq('organization_id', orgId)
    .limit(1)
  if (!existingRoles || existingRoles.length === 0) {
    await supabase.from('patrol_workflow_roles').insert(
      SEED_ROLES.map((r) => ({ organization_id: orgId, ...r }))
    )
  }

  // ロール一覧（削除済を除く）
  const { data: rolesRaw } = await supabase
    .from('patrol_workflow_roles')
    .select('id, key, label, description, sort_order, is_system')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('sort_order')
  const roles = (rolesRaw ?? []) as Role[]

  // ロール × bindings をまとめて取得
  const { data: bindingsRaw } = await supabase
    .from('patrol_workflow_role_bindings')
    .select('id, role_id, user_id, profiles!user_id(display_name)')
    .eq('organization_id', orgId)
  type RawBinding = {
    id:       string
    role_id:  string
    user_id:  string
    // supabase-js は relation を array として推論するため、片方を許容
    profiles: { display_name: string | null } | { display_name: string | null }[] | null
  }
  const bindings: Binding[] = ((bindingsRaw ?? []) as unknown as RawBinding[]).map((b) => {
    const profile = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles
    return {
      id:           b.id,
      role_id:      b.role_id,
      user_id:      b.user_id,
      display_name: profile?.display_name ?? null,
    }
  })

  // 全ユーザー一覧（紐付け選択用）
  const { data: profilesRaw } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('display_name')
  const profiles = (profilesRaw ?? []) as Profile[]

  const base = `/org/${slug}/apps/patrol-navi`

  return (
    <PatrolLayout isAdmin={true}>
      <div className="max-w-5xl p-4 sm:p-8">
        <Link
          href={`${base}/admin`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          管理メニューへ戻る
        </Link>

        <h1 className="mb-1 text-2xl font-bold">役割管理</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          ワークフローのステップ担当者として使えるアプリ内ロールを管理します。
          各ロールに既定の担当ユーザーを紐付けると、テンプレート作成時の選択肢として使えます。
        </p>

        {/* 新規追加 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              新しい役割を追加
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={async (fd: FormData) => {
                'use server'
                await createRoleAction(slug, fd)
              }}
              className="grid gap-3 md:grid-cols-[180px_1fr_auto]"
            >
              <div>
                <Label htmlFor="key" className="text-xs mb-1">キー (slug)</Label>
                <Input id="key" name="key" required pattern="[a-z][a-z0-9_]*" placeholder="例: site_supervisor" />
              </div>
              <div>
                <Label htmlFor="label" className="text-xs mb-1">表示名</Label>
                <Input id="label" name="label" required placeholder="例: 現場主任" />
              </div>
              <div className="flex items-end">
                <Button type="submit" size="sm">追加</Button>
              </div>
              <div className="md:col-span-3">
                <Label htmlFor="description" className="text-xs mb-1">説明（任意）</Label>
                <Input id="description" name="description" placeholder="この役割の説明を入力" />
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ロール一覧 */}
        <div className="space-y-3">
          {roles.map((role) => {
            const myBindings = bindings.filter((b) => b.role_id === role.id)
            const boundUserIds = new Set(myBindings.map((b) => b.user_id))
            const availableProfiles = profiles.filter((p) => !boundUserIds.has(p.id))

            return (
              <Card key={role.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <form
                        action={async (fd: FormData) => {
                          'use server'
                          await updateRoleAction(slug, role.id, fd)
                        }}
                        className="space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{role.key}</span>
                          {role.is_system && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded">
                              <Lock className="h-3 w-3" />
                              system
                            </span>
                          )}
                        </div>
                        <Input name="label" defaultValue={role.label} required className="text-base font-semibold" />
                        <Input name="description" defaultValue={role.description ?? ''} placeholder="説明（任意）" />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" variant="outline">保存</Button>
                        </div>
                      </form>
                    </div>
                    {!role.is_system && (
                      <form
                        action={async () => {
                          'use server'
                          await deleteRoleAction(slug, role.id)
                        }}
                      >
                        <Button type="submit" size="icon-sm" variant="ghost" aria-label="ロール削除">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </form>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                    <Users className="h-4 w-4" />
                    既定の担当者 ({myBindings.length})
                  </div>

                  {/* 既存 binding 一覧 */}
                  {myBindings.length > 0 && (
                    <ul className="mb-3 space-y-1">
                      {myBindings.map((b) => (
                        <li key={b.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-muted/50">
                          <span className="text-sm">{b.display_name ?? '(名前なし)'}</span>
                          <form
                            action={async () => {
                              'use server'
                              await removeBindingAction(slug, b.id)
                            }}
                          >
                            <Button type="submit" size="icon-xs" variant="ghost" aria-label="バインド解除">
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* binding 追加 */}
                  {availableProfiles.length > 0 ? (
                    <form
                      action={async (fd: FormData) => {
                        'use server'
                        await addBindingAction(slug, role.id, fd)
                      }}
                      className="flex gap-2"
                    >
                      <select
                        name="user_id"
                        required
                        defaultValue=""
                        className={cn(
                          'flex-1 h-7 rounded-lg border border-input bg-transparent px-2 text-sm',
                          'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        )}
                      >
                        <option value="" disabled>+ 担当者を追加</option>
                        {availableProfiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.display_name ?? p.id}</option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" variant="outline">追加</Button>
                    </form>
                  ) : (
                    <p className="text-xs text-muted-foreground">全ユーザーが既に紐付けられています</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {roles.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground mb-4">役割がまだ登録されていません。</p>
            <form
              action={async () => {
                'use server'
                await ensureSeedRolesAction(slug)
              }}
            >
              <Button type="submit" className={buttonVariants({ size: 'sm' })}>初期 8 ロールを投入する</Button>
            </form>
          </div>
        )}
      </div>
    </PatrolLayout>
  )
}
