'use client'

import { useState, useTransition, useRef } from 'react'
import { Camera, Loader2, X, ImageIcon, FolderOpen } from 'lucide-react'
import { uploadPatrolPhotoAction, deletePatrolPhotoAction } from './photoActions'
import { cn } from '../../../_ui/cn'

type Props = {
  slug:      string
  sheetId:   string
  itemId:    string
  initialPaths: string[]
  initialUrls:  Record<string, string>  // path → signed url
  disabled?: boolean
  /** 写真追加・削除後に呼ばれる: 親側で items state を更新するために使う */
  onChange?: (paths: string[], urls: Record<string, string>) => void
}

export function PhotoField({
  slug, sheetId, itemId,
  initialPaths, initialUrls, disabled,
  onChange,
}: Props) {
  const [paths,   setPaths]   = useState<string[]>(initialPaths)
  const [urls,    setUrls]    = useState<Record<string, string>>(initialUrls)
  const [error,   setError]   = useState<string | null>(null)
  const [zoomed,  setZoomed]  = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = '' // 同じファイル再選択許可

    setError(null)
    startTransition(async () => {
      for (const file of files) {
        const fd = new FormData()
        fd.append('photo', file)
        const res = await uploadPatrolPhotoAction(slug, sheetId, itemId, fd)
        if (res.error) { setError(res.error); break }
        if (res.photoUrls) {
          setPaths(res.photoUrls)
          // 新しい path の signed URL をローカルで仮置き（次回ロードで正しくなる）
          // 即座に表示するために BlobURL を使う
          const blob = URL.createObjectURL(file)
          const newPath = res.photoUrls[res.photoUrls.length - 1]
          const nextUrls = { ...urls, [newPath]: blob }
          setUrls(nextUrls)
          onChange?.(res.photoUrls, nextUrls)
        }
      }
    })
  }

  const handleDelete = (path: string) => {
    if (!confirm('この写真を削除しますか？')) return
    setError(null)
    startTransition(async () => {
      const res = await deletePatrolPhotoAction(slug, sheetId, itemId, path)
      if (res.error) { setError(res.error); return }
      if (res.photoUrls) {
        setPaths(res.photoUrls)
        const nextUrls = { ...urls }
        delete nextUrls[path]
        setUrls(nextUrls)
        onChange?.(res.photoUrls, nextUrls)
      }
    })
  }

  return (
    <div className="space-y-2" onClick={e => e.stopPropagation()}>
      {/* アクションボタン: カメラ起動 / ファイル選択 */}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={cameraRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            multiple
            hidden
            onChange={handleSelect}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            hidden
            onChange={handleSelect}
          />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted',
              isPending && 'opacity-50',
            )}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            写真撮影
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted',
              isPending && 'opacity-50',
            )}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            ファイル選択
          </button>
        </div>
      )}

      {/* 追加済み写真のサムネイル */}
      {paths.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {paths.map(p => {
            const url = urls[p]
            return (
              <div key={p} className="relative h-20 w-20 overflow-hidden rounded border bg-muted">
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
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}

      {/* ズームモーダル */}
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
