'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

type Props = {
  urls: string[]   // signed URLs（順序保持）
}

export function PhotoGallery({ urls }: Props) {
  const [zoomed, setZoomed] = useState<string | null>(null)

  if (urls.length === 0) return null

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {urls.map(url => (
          <button
            key={url}
            type="button"
            onClick={() => setZoomed(url)}
            className="h-16 w-16 overflow-hidden rounded border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full cursor-zoom-in object-cover" />
          </button>
        ))}
      </div>

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
    </>
  )
}
