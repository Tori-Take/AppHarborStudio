'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RlsMode = 'off' | 'strict'

export function StrictModeToggle({ appId }: { appId: string }) {
  const [current, setCurrent] = useState<RlsMode>('off')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/rls-mode`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.mode) setCurrent(j.mode as RlsMode); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [appId])

  const handleToggle = async () => {
    if (busy) return
    const next: RlsMode = current === 'strict' ? 'off' : 'strict'
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/rls-mode`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? `HTTP ${res.status}`)
        return
      }
      setCurrent(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const isStrict = current === 'strict'

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground mb-3">
        厳格モード
        <span className="ml-2 text-[11px] font-normal">
          (本番と同じく RLS を評価する。提出前チェックはこれを ON で行う)
        </span>
      </h4>
      <button
        onClick={handleToggle}
        disabled={busy}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border-2 p-3 text-left transition-colors',
          isStrict && 'border-amber-500 bg-amber-500/5',
          !isStrict && 'border-border hover:bg-muted/50',
          busy && 'opacity-60 cursor-not-allowed',
        )}
      >
        <div className="flex items-center gap-2">
          {isStrict
            ? <ShieldCheck className="h-4 w-4 text-amber-600" />
            : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
          <div>
            <div className={cn('text-xs font-semibold', isStrict && 'text-amber-700')}>
              {isStrict ? '厳格モード ON（RLS を評価）' : '厳格モード OFF（従来どおり素通り）'}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {isStrict
                ? '他組織・他ロールのデータが見えないことをここで確認できる'
                : 'schema.sql の RLS ポリシーは評価されない（開発中の既定）'}
            </div>
          </div>
        </div>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </button>
      {loaded && !error && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          対象: <code className="bg-muted px-1 rounded">createServerSupabase()</code> 経由のクエリのみ。
          <code className="ml-1 bg-muted px-1 rounded">getAdminSupabase()</code> は厳格モードでも従来どおり素通りする
          （dataAccess: &quot;privileged&quot; のカートリッジ向け）。
        </p>
      )}
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
    </div>
  )
}
