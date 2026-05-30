'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'

type Props = {
  label?: string
  className?: string
}

const defaultStyle: CSSProperties = {
  position: 'fixed',
  top: 'max(12px, env(safe-area-inset-top))',
  right: 'max(12px, env(safe-area-inset-right))',
  zIndex: 2147483000,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 9999,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1,
  color: '#fff',
  background: 'rgba(23,23,23,0.72)',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255,255,255,0.18)',
  textDecoration: 'none',
}

/** @/sdk/client の BackToAppHarbor の Studio モック（shape を本体と一致させる） */
export function BackToAppHarbor({ label = 'AppHarbor に戻る', className }: Props) {
  const pathname = usePathname() ?? ''
  const slug = pathname.match(/^\/org\/([^/]+)/)?.[1] ?? ''
  const href = slug ? `/org/${slug}/apps` : '/'

  return (
    <Link
      href={href}
      aria-label={label}
      className={className}
      style={className ? undefined : defaultStyle}
    >
      <span aria-hidden>←</span>
      {label}
    </Link>
  )
}
