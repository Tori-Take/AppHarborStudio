'use client'

import { useState, useTransition, useRef } from 'react'
import { Camera, Loader2, X, ImageIcon } from 'lucide-react'
import { uploadSheetPhotoAction, deleteSheetPhotoAction } from './photoActions'
import { cn } from '../../../_ui/cn'

type Props = {
  slug:      string
  sheetId:   string
  initialPaths: string[]
  initialUrls:  Record<string, string>
  disabled?: boolean
  /** トリガーの表示形式: 'card' = 64x64 角枠、'compact' = テキストボタン（タイトル横用） */
  triggerVariant?: 'card' | 'compact'
}

export function SheetPhotoField({
  slug, sheetId,
  initialPaths, initialUrls, disabled,
  triggerVariant = 'card',
}: Props) {
  const [paths,   setPaths]   = useState<string[]>(initialPaths)
  const [urls,    setUrls]    = useState<Record<string, string>>(initialUrls)
  const [error,   setError]   = useState<string | null>(null)
  const [zoomed,  setZoomed]  = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = ''
    setError(null)
    startTransition(async () => {
      for (const file of files) {
        const fd = new FormData()
        fd.append('photo', file)
        const res = await uploadSheetPhotoAction(slug, sheetId, fd)
        if (res.error) { setError(res.error); break }
        if (res.photoUrls) {
          setPaths(res.photoUrls)
          const blob = URL.createObjectURL(file)
          const newPath = res.photoUrls[res.photoUrls.length - 1]
          setUrls(u => ({ ...u, [newPath]: blob }))
        }
      }
    })
  }

  const handleDelete = (path: string) => {
    if (!confirm('この写真を削除しますか？')) return
    setError(null)
    startTransition(async () => {
      const res = await deleteSheetPhotoAction(slug, sheetId, path)
      if (res.error) { setError(res.error); return }
      if (res.photoUrls) {
        setPaths(res.photoUrls)
        setUrls(u => {
          const next = { ...u }
          delete next[path]
          return next
        })
      }
    })
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2">
        {paths.map(p => {
          const url = urls[p]
          return (
            <div key={p} className="relative h-16 w-16 overflow-hidden rounded border bg-muted">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  className="h-full w-full cursor-zoom-in object-cover"
                  onClick={() => setZoomed(url)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl bg-black/60 text-white hover:bg-black/80"
                  aria-label="写真を削除"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}

        {!disabled && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              multiple
              hidden
              onChange={handleSelect}
            />
            {triggerVariant === 'compact' ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isPending}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted',
                  isPending && 'opacity-50',
                )}
              >
                {isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <><Camera className="h-3 w-3" /><span>写真追加</span></>}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isPending}
                className={cn(
                  'flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded border border-dashed text-xs text-muted-foreground transition-colors',
                  'hover:border-foreground hover:text-foreground',
                  isPending && 'opacity-50',
                )}
              >
                {isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Camera className="h-4 w-4" /><span>追加</span></>}
              </button>
            )}
          </>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomed(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomed} alt="" className="max-h-full max-w-full object-contain" />
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setZoomed(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  )
}
