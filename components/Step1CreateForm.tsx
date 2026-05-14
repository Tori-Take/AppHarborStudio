'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Circle, Loader2, FolderOpen } from 'lucide-react'
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
  const [name, setName]     = useState('')
  const [id, setId]         = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [desc, setDesc]     = useState('')
  const [parent, setParent] = useState('')  // 作成先 (空ならサーバの既定 = Studio の親)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  // マウント時にサーバから既定の親フォルダを取得
  useEffect(() => {
    fetch('/api/studio-env')
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.defaultCartridgeParent) setParent(j.defaultCartridgeParent) })
      .catch(() => {})
  }, [])

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
        body: JSON.stringify({
          id:          effectiveId,
          name:        name.trim() || effectiveId,
          description: desc.trim(),
          parentPath:  parent.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? `作成失敗（HTTP ${res.status}）`)
        setBusy(false)
        return
      }
      router.push(`/cartridge/${encodeURIComponent(effectiveId)}?just-created=1`)
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const pickFolder = async () => {
    if (picking || busy) return
    setPicking(true)
    try {
      const res = await fetch('/api/fs/pick-folder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          initialPath: parent || undefined,
          title:       'カートリッジの親フォルダを選択 (この中に cart-<id>/ が作られます)',
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(`フォルダ選択に失敗しました: ${j.error ?? `HTTP ${res.status}`}`)
        return
      }
      if (j.ok && j.path) setParent(j.path)
    } catch (e) {
      alert(`フォルダ選択に失敗しました: ${(e as Error).message}`)
    } finally {
      setPicking(false)
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

            <div className="space-y-1.5">
              <Label htmlFor="parent">
                作成先フォルダ
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  この中に <code className="rounded bg-muted px-1">cart-{effectiveId || '<id>'}</code> が作られます
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="parent"
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                  placeholder="読み込み中..."
                  disabled={busy || picking}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={pickFolder}
                  disabled={busy || picking}
                  className="shrink-0 gap-1.5"
                >
                  {picking
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <FolderOpen className="h-3.5 w-3.5" />}
                  参照...
                </Button>
              </div>
              {parent && effectiveId && (
                <p className="text-xs text-muted-foreground">
                  → <code className="rounded bg-muted px-1 font-mono">{parent}{parent.endsWith('\\') || parent.endsWith('/') ? '' : '\\'}cart-{effectiveId}</code>
                </p>
              )}
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
          <Button onClick={submit} disabled={busy || !idValid} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? '確定中...' : 'アプリ情報を確定'}
          </Button>
        </div>

        {busy && (
          <p className="text-xs text-center text-muted-foreground">
            雛形フォルダと <code className="rounded bg-muted px-1">.appharbor/</code> (SDK + 規約) を生成中...
            <br />
            初回は webpack コンパイルのため 30〜90 秒かかることがあります。
          </p>
        )}
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
