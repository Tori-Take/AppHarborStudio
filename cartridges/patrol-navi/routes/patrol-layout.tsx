'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from './_ui/cn'
import { ClipboardList, Settings2, BarChart3, ClipboardCheck, Download, Plus, Menu, X } from 'lucide-react'
import { createBrowserSupabase as createClient } from '@/sdk/client'

type Props = {
  children: React.ReactNode
  isAdmin?: boolean
}

export function PatrolLayout({ children, isAdmin = false }: Props) {
  const params  = useParams<{ slug: string }>()
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [correctiveCount, setCorrectiveCount] = useState<number>(0)
  const [menuOpen, setMenuOpen] = useState(false)

  // ページ遷移時にメニューを閉じる
  useEffect(() => { setMenuOpen(false) }, [pathname])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // 自分が assignee の pending ステップ＋シートが in_progress＋current_step 一致
      const { data } = await supabase
        .from('patrol_sheet_steps')
        .select('sheet_id, step_order, patrol_check_sheets!inner(status, current_step)')
        .eq('assignee_id', user.id)
        .eq('status', 'pending')
      if (!cancelled && data) {
        const count = data.filter(row => {
          const s = (row as { patrol_check_sheets: { status: string; current_step: number } | { status: string; current_step: number }[] }).patrol_check_sheets
          const sheet = Array.isArray(s) ? s[0] : s
          return sheet?.status === 'in_progress' && sheet?.current_step === row.step_order
        }).length
        setPendingCount(count)
      }

      // 自分が担当の未完了是正アクション
      const { count: caCount } = await supabase
        .from('patrol_corrective_actions')
        .select('id', { count: 'exact', head: true })
        .eq('assignee_id', user.id)
        .in('status', ['open', 'in_progress'])
      if (!cancelled) setCorrectiveCount(caCount ?? 0)
    }

    load()
    const id = setInterval(load, 60_000) // 1分毎に再取得
    return () => { cancelled = true; clearInterval(id) }
  }, [pathname])

  const base = `/org/${params.slug}/apps/patrol-navi`

  const navItems = [
    {
      href:  `${base}/patrols?tab=action`,
      label: 'パトロール一覧',
      icon:  ClipboardList,
      match: `${base}/patrols`,
      show:  true,
      badge: pendingCount,
    },
    {
      href:  `${base}/correctives`,
      label: '是正アクション',
      icon:  ClipboardCheck,
      match: `${base}/correctives`,
      show:  true,
      badge: correctiveCount,
    },
    {
      href:  `${base}/dashboard`,
      label: 'ダッシュボード',
      icon:  BarChart3,
      match: `${base}/dashboard`,
      show:  true,
      badge: 0,
    },
    {
      href:  `${base}/reports`,
      label: '集計出力',
      icon:  Download,
      match: `${base}/reports`,
      show:  true,
      badge: 0,
    },
    {
      href:  `${base}/admin`,
      label: '管理メニュー',
      icon:  Settings2,
      match: `${base}/admin`,
      show:  isAdmin,
      badge: 0,
    },
  ]

  const totalBadge = pendingCount + correctiveCount

  return (
    <div className="flex h-full flex-col">
      <nav className="relative flex items-center gap-1 border-b bg-background px-3 py-2 sm:gap-1 sm:px-4">
        {/* モバイル: ハンバーガーボタン */}
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="メニューを開く"
          aria-expanded={menuOpen}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          {!menuOpen && totalBadge > 0 && (
            <span className="absolute right-1 top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {totalBadge > 99 ? '99+' : totalBadge}
            </span>
          )}
        </button>

        <span className="text-base font-semibold text-primary sm:mr-4 sm:text-lg">PatrolNavi</span>

        {/* デスクトップ: 横並びナビ */}
        <div className="hidden items-center gap-1 sm:flex">
          {navItems.filter(item => item.show).map(item => {
            const active = pathname.startsWith(item.match)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        <Link
          href={`${base}/patrols/new`}
          className="ml-auto inline-flex items-center justify-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span>パトロール開始</span>
        </Link>

        {/* モバイル: ハンバーガー展開時のドロップダウン */}
        {menuOpen && (
          <>
            {/* クリックで閉じるオーバーレイ */}
            <button
              type="button"
              aria-hidden="true"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-30 bg-black/20 sm:hidden"
            />
            <div className="absolute inset-x-2 top-full z-40 mt-1 rounded-lg border bg-background p-1 shadow-lg sm:hidden">
              {navItems.filter(item => item.show).map(item => {
                const active = pathname.startsWith(item.match)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge > 0 && (
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </nav>

      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
