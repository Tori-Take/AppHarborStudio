'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { Button } from '../../_ui/button'
import { importChecklistTemplateAction } from './actions'

export function ImportChecklistButton({ slug }: { slug: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router   = useRouter()
  const [pending, start] = useTransition()

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const name = file.name.replace(/\.csv$/i, '')
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      start(async () => {
        const res = await importChecklistTemplateAction(slug, text, name)
        if (res.error) {
          alert(`インポート失敗: ${res.error}`)
          return
        }
        // Vercel の in-memory PGlite はインスタンス間でデータが共有されないため、
        // 別ページへ即リダイレクトすると 404 になることがある。
        // リストページに留まり、リフレッシュで新規テンプレートを反映する。
        router.refresh()
        alert(`インポート完了: "${name}"`)
      })
    }
    reader.readAsText(file)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {pending ? 'インポート中…' : 'インポート'}
      </Button>
    </>
  )
}
