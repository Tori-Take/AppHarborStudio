'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  /** クリップボードにコピーする文字列 */
  text:    string
  /** ボタン横に表示するラベル (省略可・アイコンのみ表示) */
  label?:  string
  /** Button variant */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  /** Button size */
  size?:   'sm' | 'default' | 'icon'
  /** 追加 className */
  className?: string
  /** コピー後の表示時間 (ms) */
  durationMs?: number
}

/**
 * クリップボードにテキストをコピーするボタン。
 * コピー成功時に 2 秒間チェックマーク表示。
 */
export function CopyButton({
  text,
  label,
  variant = 'outline',
  size = 'sm',
  className,
  durationMs = 2000,
}: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), durationMs)
    } catch {
      alert('クリップボードへのコピーに失敗しました。')
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={cn('gap-1.5', className)}
      type="button"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
        : <Copy className="h-3.5 w-3.5" />}
      {label && (
        <span>{copied ? 'コピー完了' : label}</span>
      )}
    </Button>
  )
}
