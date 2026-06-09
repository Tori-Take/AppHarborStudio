'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Minus, Loader2, FolderOpen } from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { slugify, softSlug, isAbsolutePath } from '@/lib/slug'

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
  const [parentLoading, setParentLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const errRef = useRef<HTMLDivElement>(null)
  // キャンセルの遷移先（カートリッジ一覧）は git スキャンで数秒かかることがある。
  // useTransition で「押した瞬間に pending（スピナー）」を出し、固まって見えないようにする。
  const [isLeaving, startLeaving] = useTransition()

  // マウント時にサーバから既定の親フォルダを取得
  useEffect(() => {
    fetch('/api/studio-env')
      .then((r) => r.ok ? r.json() : null)
      // ユーザーが既に入力済みなら上書きしない
      .then((j) => { if (j?.defaultCartridgeParent) setParent((prev) => prev || j.defaultCartridgeParent) })
      .catch(() => {})
      .finally(() => setParentLoading(false))
  }, [])

  // エラーが出たらその位置までスクロール（ボタンが画面下でも気づける）
  useEffect(() => {
    if (err) errRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [err])

  // 表示用（タイプ中はソフト整形でハイフンを残す）
  const effectiveId = idTouched ? id : slugify(name)
  // 実際に作られる ID（先頭/末尾ハイフン除去後）
  const normId = useMemo(() => slugify(effectiveId), [effectiveId])

  const checks = useMemo(() => ({
    length:  normId.length >= 2 && normId.length <= 40,
    charset: /^[a-z0-9-]*$/.test(normId) && normId.length > 0,
    start:   /^[a-z]/.test(normId),
  }), [normId])
  const idValid    = checks.length && checks.charset && checks.start
  const nameValid  = name.trim().length > 0
  const trimmedParent = parent.trim()
  const parentValid = trimmedParent.length === 0 || isAbsolutePath(trimmedParent)
  const canSubmit   = idValid && nameValid && parentValid
  // アプリ名は入れたが自動候補が空 = 日本語等で slug が作れなかったケース
  const needsManualId = !idTouched && nameValid && normId.length === 0

  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/cartridges/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id:          normId,
          name:        name.trim(),
          description: desc.trim(),
          parentPath:  trimmedParent || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? `作成失敗（HTTP ${res.status}）`)
        setBusy(false)
        return
      }
      router.push(`/cartridge/${encodeURIComponent(normId)}?just-created=1`)
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
    setId(softSlug(e.target.value))
  }

  return (
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
                onBlur={() => { if (idTouched) setId(slugify(id)) }}
                disabled={busy}
                aria-describedby="id-rules"
                aria-invalid={effectiveId.length > 0 && !idValid}
                className={cn(
                  'font-mono',
                  effectiveId.length > 0 && (idValid ? 'border-emerald-500' : 'border-destructive')
                )}
              />
            </div>
            <ul id="id-rules" aria-live="polite" className="mt-2 space-y-0.5 text-xs">
              <Rule ok={checks.charset}>半角の英数字 (a-z, 0-9) とハイフン (-) のみ</Rule>
              <Rule ok={checks.start}>先頭は英字 (a〜z) から始める</Rule>
              <Rule ok={checks.length}>2〜40 文字</Rule>
            </ul>
            {needsManualId && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                アプリ名から識別子を作れませんでした。半角英数字で入力してください。
              </p>
            )}
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
                この中に <code className="rounded bg-muted px-1">cart-{normId || '<id>'}</code> が作られます
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="parent"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                placeholder={parentLoading ? '読み込み中...' : '例: C:\\Users\\you\\Projects (絶対パス)'}
                disabled={busy || picking}
                aria-invalid={!parentValid}
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
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  : <FolderOpen className="h-3.5 w-3.5" aria-hidden />}
                参照...
              </Button>
            </div>
            {!parentValid && (
              <p className="text-xs text-destructive">
                作成先フォルダは絶対パスで指定してください (例: C:\Users\you\Projects)。
              </p>
            )}
            {parentValid && trimmedParent && normId && (
              <p className="text-xs text-muted-foreground">
                → <code className="rounded bg-muted px-1 font-mono">{trimmedParent}{trimmedParent.endsWith('\\') || trimmedParent.endsWith('/') ? '' : '\\'}cart-{normId}</code>
              </p>
            )}
          </div>

        </CardContent>
      </Card>

      {err && (
        <div
          ref={errRef}
          role="alert"
          className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {err}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => startLeaving(() => router.push('/'))}
          disabled={busy || isLeaving}
          className="gap-1.5"
        >
          {isLeaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          キャンセル
        </Button>
        <Button onClick={submit} disabled={busy || !canSubmit || isLeaving} className="gap-1.5">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
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
  )
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn(
      'flex items-center gap-1.5',
      ok ? 'text-emerald-600 dark:text-emerald-500' : 'text-muted-foreground',
    )}>
      {ok
        ? <Check className="h-3 w-3 shrink-0" aria-hidden />
        : <Minus className="h-3 w-3 shrink-0" aria-hidden />}
      <span>{children}</span>
    </li>
  )
}
