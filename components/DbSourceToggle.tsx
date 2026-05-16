'use client'

import { useEffect, useState } from 'react'
import { Database, Loader2, AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStageStatus, type StageNum } from '@/lib/use-stage-status'

export type DbSource = 'pglite' | 'docker' | 'studio-cloud'

type SourceDef = {
  id: DbSource
  label: string
  sublabel: string
  requiresStage: StageNum
}

const SOURCES: SourceDef[] = [
  { id: 'pglite',       label: 'PGlite',          sublabel: 'ローカル (デフォルト)',        requiresStage: 1 },
  { id: 'docker',       label: 'Docker Supabase', sublabel: 'ローカル Postgres',            requiresStage: 2 },
  { id: 'studio-cloud', label: 'Studio Supabase', sublabel: 'クラウド (Studio 専用)',       requiresStage: 3 },
]

export function DbSourceToggle({ appId }: { appId: string }) {
  const { stages } = useStageStatus(appId)
  const [current, setCurrent] = useState<DbSource>('pglite')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/db-source`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.source) setCurrent(j.source as DbSource); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [appId])

  const handleSelect = async (next: DbSource) => {
    if (busy || next === current) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/db-source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: next }),
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

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground mb-3">
        DB ソース
        <span className="ml-2 text-[11px] font-normal">
          (このカートリッジを起動した時にデータを読む先)
        </span>
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {SOURCES.map(s => {
          const stageDone = s.requiresStage === 1 || stages[s.requiresStage].completed
          const isActive = current === s.id
          const isDisabled = !stageDone || busy
          return (
            <button
              key={s.id}
              onClick={() => handleSelect(s.id)}
              disabled={isDisabled}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-colors',
                isActive && 'border-emerald-500 bg-emerald-500/5',
                !isActive && !isDisabled && 'border-border hover:bg-muted/50',
                !isActive && isDisabled && 'border-border opacity-40 cursor-not-allowed',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Database className={cn('h-3.5 w-3.5', isActive && 'text-emerald-600')} />
                  <span className={cn('text-xs font-semibold', isActive && 'text-emerald-700')}>{s.label}</span>
                </div>
                {isActive && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </div>
              <div className="text-[10px] text-muted-foreground">{s.sublabel}</div>
              {!stageDone && (
                <div className="text-[10px] text-muted-foreground">
                  Stage {s.requiresStage} 完了後
                </div>
              )}
            </button>
          )
        })}
      </div>
      {loaded && (
        <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          現在使用中: <code className="bg-muted px-1 rounded">{current}</code>
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
