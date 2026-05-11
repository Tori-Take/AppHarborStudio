'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '../../../_ui/button'
import { Input } from '../../../_ui/input'
import { Label } from '../../../_ui/label'
import { DISPLAY_STYLE_LABEL, type DisplayStyle } from '../../../_types'
import { addPatrolItemAction } from '../actions'
import type { CategoryData } from './category-types'
import { CategoryComboInput } from './CategoryComboInput'

type Props = {
  slug:         string
  templateId:   string
  categoryData: CategoryData
  onClose:      () => void
  onAdded:      () => void
}

const SELECT_CLASS = 'flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
const INPUT_CLASS = 'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'

export function AddItemModal({ slug, templateId, categoryData, onClose, onAdded }: Props) {
  const [category1,    setCategory1]    = useState('')
  const [category2,    setCategory2]    = useState('')
  const [category3,    setCategory3]    = useState('')
  const [itemText,     setItemText]     = useState('')
  const [isImportant,  setIsImportant]  = useState(false)
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('normal')
  const [weight,       setWeight]       = useState('1.0')
  const [regulation,   setRegulation]   = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)

  const cat2Options = useMemo(() => categoryData.getCat2List(category1), [categoryData, category1])
  const cat3Options = useMemo(() => categoryData.getCat3List(category1, category2), [categoryData, category1, category2])

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('category1',      category1)
      fd.set('category2',      category2)
      fd.set('category3',      category3)
      fd.set('item_text',      itemText)
      if (isImportant) fd.set('is_important', 'on')
      fd.set('display_style',  displayStyle)
      fd.set('weight',         weight)
      fd.set('regulation_ref', regulation)
      const res = await addPatrolItemAction(templateId, slug, {}, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      onAdded()
    } finally {
      setSaving(false)
    }
  }

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex w-full max-w-xl flex-col rounded-lg border bg-background shadow-xl"
        style={{ maxHeight: '85vh' }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">チェック項目を追加</h2>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} aria-label="閉じる">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSave} className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="add_category1" className="text-xs">大分類</Label>
              <CategoryComboInput id="add_category1" inputRef={inputRef} value={category1} onChange={setCategory1} options={categoryData.cat1List} disabled={saving} placeholder="例: 安全" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add_category2" className="text-xs">中分類</Label>
              <CategoryComboInput id="add_category2" value={category2} onChange={setCategory2} options={cat2Options} disabled={saving} placeholder="例: 墜落防止" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add_category3" className="text-xs">小分類</Label>
              <CategoryComboInput id="add_category3" value={category3} onChange={setCategory3} options={cat3Options} disabled={saving} placeholder="例: 高所作業" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="add_item_text">項目内容 <span className="text-destructive">*</span></Label>
            <Input id="add_item_text" value={itemText} onChange={(e) => setItemText(e.target.value)} required disabled={saving} placeholder="例: 安全帯を正しく装着しているか" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="add_display_style" className="text-xs">表示スタイル</Label>
              <select id="add_display_style" value={displayStyle} onChange={(e) => setDisplayStyle(e.target.value as DisplayStyle)} disabled={saving} className={SELECT_CLASS}>
                {(['normal','important_red','important_bold','critical'] as DisplayStyle[]).map((s) => (
                  <option key={s} value={s}>{DISPLAY_STYLE_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add_weight" className="text-xs">重み</Label>
              <Input id="add_weight" type="number" step="0.1" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} disabled={saving} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="add_regulation_ref" className="text-xs">規程・参照（任意）</Label>
            <Input id="add_regulation_ref" value={regulation} onChange={(e) => setRegulation(e.target.value)} disabled={saving} placeholder="例: 労安規則 第518条" />
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={isImportant} onChange={(e) => setIsImportant(e.target.checked)} disabled={saving} className="h-4 w-4" />
            <span><strong>重要項目</strong> (★ アイコン付き)</span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button type="button" onClick={handleSave} disabled={saving || !itemText.trim()}>{saving ? '追加中…' : '追加'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
