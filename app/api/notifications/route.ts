import { NextResponse } from 'next/server'
import {
  listAnnouncementsForCurrentUser,
  markAllAnnouncementsRead,
  markAnnouncementRead,
} from '@/lib/sdk-mock/announcements-server'

/**
 * Studio chrome の NotificationBell が叩く内部 API。
 * データソースは本番と同じ `announcements` テーブル (Studio mock の PGlite)。
 */
export async function GET() {
  const items = await listAnnouncementsForCurrentUser()
  const unreadCount = items.filter((n) => n.readAt === null).length
  return NextResponse.json({ items, unreadCount })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (body?.action === 'mark-all-read') {
    await markAllAnnouncementsRead()
    return NextResponse.json({ ok: true })
  }
  if (body?.action === 'mark-read' && typeof body?.id === 'string') {
    await markAnnouncementRead(body.id)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
