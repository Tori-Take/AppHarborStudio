'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Circle } from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** 表示名や生入力から ID 候補を作る（半角英数とハイフンのみに整形） */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * 新規カートリッジ作成フォーム。
 * AppHarbor の /platform/organizations/new と揃えた Tailwind + shadcn 構成。
 */
export function Step1CreateForm() {
  const router = useRouter()
  const [name, setName]   = useState('')
  const [id, setId]       = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [desc, setDesc]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState<string | null>(null)

  const effectiveId = idTouched ? id : slugify(name)

  const checks = useMemo(() => ({
    length:  effectiveId.length >= 2 && effectiveId.length <= 40,
    charset: /^[a-z0-9-]*$/.test(effectiveId) && effectiveId.length > 0,
    start:   /^[a-z]/.test(effectiveId),
  }), [effectiveId])
  const idValid = checks.length && checks.charset && checks.start

  const submit = async () => {
    if (!idValid || busy) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/cartridges/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: effectiveId, name: name.trim() || effectiveId, description: desc.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? `作成失敗（HTTP ${res.status}）`)
        setBusy(false)
        return
      }
      router.push(`/cartridge/${encodeURIComponent(effectiveId)}/getting-started`)
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
  }

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIdTouched(true)
    setId(slugify(e.target.value))
  }

  return (
    <>
      {err && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {err}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">アプリ情報</CardTitle>
            <CardDescription>
              名前と識別子を決めて雛形を生成します。後から編集できます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            <div className="space-y-1.5">
              <Label htmlFor="name">
                アプリ名 <span className="text-destructive">*</span>
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  人が見る名前 (例: タイピング練習)
                </span>
              </Label>
              <Input
                id="name"
                placeholder="例: タイピング練習"
                value={name}
                onChange={handleNameChange}
                autoFocus
                disabled={busy}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="id">
                識別子 <span className="text-destructive">*</span>
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  URL やフォルダ名に使う英数字 (自動候補が入ります)
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-muted-foreground">/org/&lt;org&gt;/apps/</span>
                <Input
                  id="id"
                  placeholder="例: typing-practice"
                  value={effectiveId}
                  onChange={handleIdChange}
                  disabled={busy}
                  className={cn(
                    'font-mono',
                    effectiveId.length > 0 && (idValid ? 'border-emerald-500' : 'border-destructive')
                  )}
                />
              </div>
              <ul className="mt-2 space-y-0.5 text-xs">
                <Rule ok={checks.charset}>半角の英数字 (a-z, 0-9) とハイフン (-) のみ</Rule>
                <Rule ok={checks.start}>先頭は英字 (a〜z) から始める</Rule>
                <Rule ok={checks.length}>2〜40 文字</Rule>
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">
                説明
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  任意 — 後から変更できます
                </span>
              </Label>
              <Input
                id="desc"
                placeholder="例: ローマ字タイピングの練習アプリ"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                disabled={busy}
              />
            </div>

          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: 'outline' }), busy && 'pointer-events-none opacity-50')}
          >
            キャンセル
          </Link>
          <Button onClick={submit} disabled={busy || !idValid}>
            {busy ? '確定中...' : 'アプリ情報を確定'}
          </Button>
        </div>
      </div>
    </>
  )
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn(
      'flex items-center gap-1.5',
      ok ? 'text-emerald-600 dark:text-emerald-500' : 'text-muted-foreground',
    )}>
      {ok
        ? <Check className="h-3 w-3 shrink-0" />
        : <Circle className="h-3 w-3 shrink-0" />}
      <span>{children}</span>
    </li>
  )
}
