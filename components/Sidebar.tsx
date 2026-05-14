'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Home, Settings, BookOpen, ExternalLink, GitBranch, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import { PhaseIndicator } from '@/components/PhaseIndicator'

type EnvInfo = {
  cartridgesPath: string
  productionUrl:  string
  branch:         string
  inSync:         boolean
}

/**
 * Studio 共通サイドバー（AppHarbor 本体の OrgNavLinks と統一感のあるデザイン）
 *
 * - 上部: Studio ロゴ + ナビゲーション（カートリッジ / 設定 / ヘルプ）
 * - 下部: 環境情報パネル（パス・ブランチ・本番リンク）
 *
 * プレビュー画面（/org/[slug]/apps/...）では非表示にする。
 */
export function Sidebar() {
  const pathname = usePathname()
  const [env, setEnv] = useState<EnvInfo | null>(null)

  // プレビュー画面では非表示
  const hideOnPreview = pathname?.startsWith('/org/')

  useEffect(() => {
    if (hideOnPreview) return
    fetch('/api/studio-env')
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j) setEnv(j) })
      .catch(() => {})
  }, [hideOnPreview])

  if (hideOnPreview) return null

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname?.startsWith('/cartridge')
    return pathname?.startsWith(href)
  }

  return (
    <aside className="hidden md:flex w-56 flex-col border-r bg-muted/30 shrink-0">
      {/* ロゴ部（Studio はモノクロで本体と差別化） */}
      <div className="border-b px-4 py-4 flex flex-col items-center">
        <Image
          src="/brand/appharbor-logo-black.svg"
          alt="AppHarbor Studio"
          width={168}
          height={32}
          priority
          className="h-8 w-auto"
        />
        <p className="mt-0.5 text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
          Studio
        </p>
        <div className="mt-2">
          <PhaseIndicator />
        </div>
      </div>

      {/* ナビ（メイン） */}
      <nav className="p-3 space-y-1">
        <NavLink href="/" icon={Home} label="ホーム" active={isActive('/')} />
      </nav>

      {/* スペーサー */}
      <div className="flex-1" />

      {/* ナビ（補助・下部） */}
      <nav className="p-3 space-y-1 border-t">
        <NavLink href="/settings" icon={Settings} label="設定" active={isActive('/settings')} />
        <NavLink href="/help" icon={BookOpen} label="ヘルプ" active={isActive('/help')} disabled />
      </nav>

      {/* 仮ユーザー切替（プレビューのロール検証用） */}
      <div className="border-t p-3">
        <RoleSwitcher />
      </div>

      {/* 環境情報フッター */}
      {env && (
        <div className="border-t p-3 space-y-2 text-xs">
          {/* 同期ステータス */}
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'inline-block h-2 w-2 rounded-full',
              env.inSync ? 'bg-emerald-500' : 'bg-amber-500',
            )} />
            <span className="text-muted-foreground">
              {env.inSync ? 'リポと同期' : '未同期あり'}
            </span>
          </div>

          {/* git branch */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono">{env.branch}</span>
          </div>

          {/* cartridges path */}
          <div className="flex items-center gap-1.5 text-muted-foreground" title={env.cartridgesPath}>
            <FolderOpen className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono">{shortPath(env.cartridgesPath)}</span>
          </div>

          {/* 本番リンク */}
          <a
            href={env.productionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1.5 hover:bg-accent text-foreground border"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">本番を開く</span>
          </a>
        </div>
      )}
    </aside>
  )
}

function NavLink({
  href, icon: Icon, label, active, disabled,
}: {
  href:    string
  icon:    React.ComponentType<{ className?: string }>
  label:   string
  active?: boolean
  disabled?: boolean
}) {
  if (disabled) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
          'text-muted-foreground/50 cursor-not-allowed',
        )}
        title="準備中"
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
    )
  }
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  )
}

/** "C:\Users\...\AppHarbor\cartridges" → "AppHarbor/cartridges" */
function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.slice(-2).join('/')
}
