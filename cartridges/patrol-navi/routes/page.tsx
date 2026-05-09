import { redirect } from 'next/navigation'
import { requireApp } from '@/sdk'

export default async function PatrolNaviHomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // アクセス権チェック（無ければ notFound）
  await requireApp(slug, 'patrol-navi')
  redirect(`/org/${slug}/apps/patrol-navi/patrols`)
}
