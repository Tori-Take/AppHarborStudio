import { requireApp } from '@/sdk'
import { PatrolLayout } from '../../../patrol-layout'
import { canViewPatrols, isPatrolAdmin } from '../../../_helpers/patrolRole'
import { EditPatrolClient } from './EditPatrolClient'

export default async function EditPatrolPage({
  params,
}: {
  params: Promise<{ slug: string; sheetId: string }>
}) {
  const { slug, sheetId } = await params

  // viewer 以上ならアクセス可。実編集は server action 内で
  // patroller_id (= sheet 作成者) === actor.id を検証する。
  const ctx = await requireApp(slug, 'patrol-navi', canViewPatrols)
  const isAdmin = isPatrolAdmin(ctx.role)

  return (
    <PatrolLayout isAdmin={isAdmin}>
      <EditPatrolClient slug={slug} sheetId={sheetId} currentUserId={ctx.actor.id} isAdmin={isAdmin} />
    </PatrolLayout>
  )
}
