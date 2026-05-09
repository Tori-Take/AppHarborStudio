'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Copy, Check, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Asset = {
  name:        string
  filename:    string  // /brand/<filename>
  description: string
  bg:          'light' | 'dark'
  size:        number  // px for preview
}

const ASSETS: Asset[] = [
  { name: '1. カラー版（標準）',          filename: 'appharbor-color.svg',       description: 'ウェブサイト用、ロゴ表示、favicon ソースに最適', bg: 'light', size: 64 },
  { name: '2. 単色 黒（currentColor）',   filename: 'appharbor-black.svg',       description: 'React コンポーネント化に最適、CSS の color で色を変更可', bg: 'light', size: 64 },
  { name: '3. 単色 白（ダークモード用）',  filename: 'appharbor-white.svg',       description: 'ダーク UI に直接配置、透過背景',                bg: 'dark',  size: 64 },
  { name: '4. Amber 背景版（アプリアイコン）', filename: 'appharbor-app.svg',     description: 'PWA、iOS、Android のホーム画面用、角丸スクエア背景', bg: 'light', size: 80 },
  { name: '5. ライトモード ロゴ',         filename: 'appharbor-logo-light.svg',  description: '白〜薄グレー背景の上で使用、アイコン+ワードマーク', bg: 'light', size: 220 },
  { name: '6. ダークモード ロゴ',         filename: 'appharbor-logo-dark.svg',   description: '黒〜濃グレー背景の上で使用、アイコン+ワードマーク', bg: 'dark',  size: 220 },
  { name: '7. 単色ロゴ（currentColor）',  filename: 'appharbor-logo-mono.svg',   description: 'ライト・ダーク両方で使える汎用版、CSS color で制御', bg: 'light', size: 220 },
]

export function BrandAssets() {
  const [copied, setCopied] = useState<string | null>(null)
  const [svgCache, setSvgCache] = useState<Record<string, string>>({})

  const fetchSvg = async (filename: string): Promise<string> => {
    if (svgCache[filename]) return svgCache[filename]
    const res = await fetch(`/brand/${filename}`)
    const text = await res.text()
    setSvgCache((c) => ({ ...c, [filename]: text }))
    return text
  }

  const handleCopy = async (filename: string) => {
    try {
      const svg = await fetchSvg(filename)
      await navigator.clipboard.writeText(svg)
      setCopied(filename)
      setTimeout(() => setCopied(null), 1500)
    } catch (e) {
      alert(`コピー失敗: ${(e as Error).message}`)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">AppHarbor ロゴアセット</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          7 種すべての SVG。各カードの <Copy className="inline h-3 w-3 align-text-top" /> アイコンで SVG ソースをコピー、
          <Download className="inline h-3 w-3 align-text-top" /> でダウンロードできます。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ASSETS.map((a) => (
          <div key={a.filename} className="rounded-lg border bg-card p-4">
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium leading-tight">{a.name}</h3>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleCopy(a.filename)}
                  title="SVG ソースをコピー"
                >
                  {copied === a.filename ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <a
                  href={`/brand/${a.filename}`}
                  download={a.filename}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  title="SVG をダウンロード"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">{a.description}</p>
            <div
              className={`flex h-24 items-center justify-center rounded-md border ${
                a.bg === 'dark' ? 'bg-neutral-900' : 'bg-white'
              }`}
            >
              <Image
                src={`/brand/${a.filename}`}
                alt={a.name}
                width={a.size}
                height={a.size}
                style={{ width: a.size, height: 'auto' }}
              />
            </div>
            <div className="mt-2 font-mono text-[11px] text-muted-foreground">
              /brand/{a.filename}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
