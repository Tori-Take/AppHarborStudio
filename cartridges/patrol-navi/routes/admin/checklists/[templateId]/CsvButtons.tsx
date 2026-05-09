'use client'

import { useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Download, Upload, X, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '../../../_ui/button'
import { cn } from '../../../_ui/cn'
import {
  exportItemsCsvAction,
  previewCsvImportAction,
  applyCsvImportAction,
  type DiffPreview,
} from './csv-actions'

type Props = {
  slug:       string
  templateId: string
}

export function CsvButtons({ slug, templateId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [preview, setPreview] = useState<DiffPreview | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult]   = useState<{ added: number; updated: number; deleted: number } | null>(null)

  // ─── ダウンロード ──────────────────────────────────────
  const handleDownload = async () => {
    setError(null)
    setDownloading(true)
    try {
      const res = await exportItemsCsvAction(slug, templateId)
      if (res.error || !res.csv) { setError(res.error ?? 'エクスポート失敗'); return }
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename ?? 'checklist.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  // ─── ファイル選択 → プレビュー ──────────────────────────
  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      setCsvText(text)
      startTransition(async () => {
        const res = await previewCsvImportAction(slug, templateId, text)
        if (res.error || !res.preview) {
          setError(res.error ?? 'プレビュー失敗')
          setCsvText(null)
          return
        }
        setPreview(res.preview)
      })
    }
    reader.readAsText(file)
  }

  // ─── 適用 ──────────────────────────────────────────────
  const handleApply = () => {
    if (!csvText) return
    setError(null)
    startTransition(async () => {
      const res = await applyCsvImportAction(slug, templateId, csvText)
      if (res.error) { setError(res.error); return }
      setResult({ added: res.added ?? 0, updated: res.updated ?? 0, deleted: res.deleted ?? 0 })
      setPreview(null)
      setCsvText(null)
      // 反映
      setTimeout(() => { window.location.reload() }, 1200)
    })
  }

  const handleCancel = () => {
    setPreview(null)
    setCsvText(null)
    setError(null)
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={handleSelect}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={downloading}
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        CSV ダウンロード
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={pending}
      >
        {pending && !preview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        CSV アップロード
      </Button>

      {/* 結果トースト */}
      {result && createPortal(
        <div className="fixed inset-x-0 top-4 z-[9999] mx-auto flex max-w-sm items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 shadow-lg">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">CSV を適用しました</p>
            <p className="text-xs text-emerald-700">
              追加 {result.added} / 更新 {result.updated} / 削除 {result.deleted}
            </p>
          </div>
        </div>,
        document.body,
      )}

      {/* エラー表示 */}
      {error && createPortal(
        <div className="fixed inset-x-0 top-4 z-[9999] mx-auto flex max-w-md items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 shadow-lg">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">エラー</p>
            <pre className="whitespace-pre-wrap text-xs">{error}</pre>
          </div>
          <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
            <X className="h-4 w-4" />
          </button>
        </div>,
        document.body,
      )}

      {/* プレビューモーダル */}
      {preview && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, overflowY: 'auto',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel() }}
        >
          <div
            className="flex w-full max-w-2xl flex-col rounded-lg border bg-background shadow-xl"
            style={{ maxHeight: '85vh' }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-base font-semibold">CSV インポート プレビュー</h2>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {/* サマリ */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <p className="text-xs text-emerald-700">追加</p>
                  <p className="text-2xl font-bold text-emerald-700">{preview.toAdd.length}</p>
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-center">
                  <p className="text-xs text-blue-700">更新</p>
                  <p className="text-2xl font-bold text-blue-700">{preview.toUpdate.length}</p>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-xs text-red-700">削除</p>
                  <p className="text-2xl font-bold text-red-700">{preview.toDelete.length}</p>
                </div>
              </div>

              {preview.errors.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
                  <p className="font-medium text-amber-800">⚠ 解析時の警告</p>
                  <ul className="mt-1 list-disc pl-4 text-amber-700">
                    {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              {/* 詳細 */}
              {preview.toAdd.length > 0 && (
                <details className="rounded-md border bg-emerald-50/50">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-emerald-800">
                    + 追加される項目 ({preview.toAdd.length})
                  </summary>
                  <ul className="space-y-1 px-4 pb-3 text-xs">
                    {preview.toAdd.slice(0, 50).map((it, i) => (
                      <li key={i} className="truncate">
                        <span className="text-muted-foreground">{it.category1} › {it.category2}</span> {it.item_text}
                      </li>
                    ))}
                    {preview.toAdd.length > 50 && <li className="text-muted-foreground">…他 {preview.toAdd.length - 50} 件</li>}
                  </ul>
                </details>
              )}
              {preview.toUpdate.length > 0 && (
                <details className="rounded-md border bg-blue-50/50">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-blue-800">
                    ~ 更新される項目 ({preview.toUpdate.length})
                  </summary>
                  <ul className="space-y-1 px-4 pb-3 text-xs">
                    {preview.toUpdate.slice(0, 50).map((u, i) => (
                      <li key={i} className="truncate">
                        <span className="text-muted-foreground">{u.next.category1} › {u.next.category2}</span> {u.next.item_text}
                      </li>
                    ))}
                    {preview.toUpdate.length > 50 && <li className="text-muted-foreground">…他 {preview.toUpdate.length - 50} 件</li>}
                  </ul>
                </details>
              )}
              {preview.toDelete.length > 0 && (
                <details className="rounded-md border bg-red-50/50">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-red-800">
                    - 削除される項目 ({preview.toDelete.length})
                  </summary>
                  <ul className="space-y-1 px-4 pb-3 text-xs">
                    {preview.toDelete.slice(0, 50).map((it, i) => (
                      <li key={i} className="truncate">
                        <span className="text-muted-foreground">{it.category1} › {it.category2}</span> {it.item_text}
                      </li>
                    ))}
                    {preview.toDelete.length > 50 && <li className="text-muted-foreground">…他 {preview.toDelete.length - 50} 件</li>}
                  </ul>
                </details>
              )}

              <p className="text-[11px] text-muted-foreground">
                適用するとテンプレートのバージョンが上がります。既存パトロールシートは作成時のバージョンで凍結されているため影響しません。
                削除は論理削除（is_active=false）で過去のシートとの参照は維持されます。
              </p>
            </div>

            <div className={cn('flex items-center justify-end gap-2 border-t px-4 py-3')}>
              <Button type="button" variant="outline" onClick={handleCancel} disabled={pending}>
                キャンセル
              </Button>
              <Button
                type="button"
                onClick={handleApply}
                disabled={pending || preview.errors.length > 0
                  || (preview.toAdd.length === 0 && preview.toUpdate.length === 0 && preview.toDelete.length === 0)}
              >
                {pending ? '適用中…' : '適用する'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
