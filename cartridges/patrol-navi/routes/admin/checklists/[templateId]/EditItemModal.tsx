'use client'

/**
 * チェック項目 編集モーダル
 *
 * 既存の patrol_items 行の内容を編集する:
 *   - 3 階層カテゴリ (category1/2/3)
 *   - item_text
 *   - is_important
 *   - display_style (4 種プリセット)
 *   - weight
 *   - regulation_ref
 *
 * sort_order と input_type は変更しない (構造を壊さないため)。
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '../../../_ui/button'
import { Input } from '../../../_ui/input'
import { Label } from '../../../_ui/label'
import {
  DISPLAY_STYLE_LABEL,
  type DisplayStyle, type PatrolItem,
} from '../../../_types'
import { updatePatrolItemAction } from '../actions'

type Props = {
  slug:    string
  item:    PatrolItem
  onClose: () => void
  onSaved: () => void
}

const SELECT_CLASS = 'flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function EditItemModal({ slug, item, onClose, onSaved }: Props) {
  const [category1,    setCategory1]    = useState(item.category1 ?? '')
  const [category2,    setCategory2]    = useState(item.category2 ?? '')
  const [category3,    setCategory3]    = useState(item.category3 ?? '')
  const [itemText,     setItemText]     = useState(item.item_text ?? '')
  const [isImportant,  setIsImportant]  = useState(!!item.is_important)
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>((item.display_style ?? 'normal') as DisplayStyle)
  const [weight,       setWeight]       = useState(String(item.weight ?? 1))
  const [regulation,   setRegulation]   = useState(item.regulation_ref ?? '')
  const [error,        setError]        = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)

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
      fd.set('is_important',   isImportant ? 'true' : '')
      fd.set('display_style',  displayStyle)
      fd.set('weight',         weight)
      fd.set('regulation_ref', regulation)
      const res = await updatePatrolItemAction(item.id, slug, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      onSaved()
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
          <h2 className="text-base font-semibold">チェック項目を編集</h2>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} aria-label="閉じる">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSave} className="flex-1 space-y-3 overflow-y-auto p-4">
          {/* カテゴリ 3 階層 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="edit_category1" className="text-xs">大分類</Label>
              <Input
                id="edit_category1"
                ref={inputRef}
                value={category1}
                onChange={(e) => setCategory1(e.target.value)}
                disabled={saving}
                placeholder="品質"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_category2" className="text-xs">中分類</Label>
              <Input
                id="edit_category2"
                value={category2}
                onChange={(e) => setCategory2(e.target.value)}
                disabled={saving}
                placeholder="コーディング"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_category3" className="text-xs">小分類</Label>
              <Input
                id="edit_category3"
                value={category3}
                onChange={(e) => setCategory3(e.target.value)}
                disabled={saving}
                placeholder="サーバー動作"
              />
            </div>
          </div>

          {/* 項目本文 */}
          <div className="space-y-1">
            <Label htmlFor="edit_item_text">
              項目内容 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit_item_text"
              value={itemText}
              onChange={(e) => setItemText(e.target.value)}
              required
              disabled={saving}
              placeholder="404 が出ていないか？"
            />
          </div>

          {/* 表示スタイル + 重み */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="edit_display_style" className="text-xs">表示スタイル</Label>
              <select
                id="edit_display_style"
                value={displayStyle}
                onChange={(e) => setDisplayStyle(e.target.value as DisplayStyle)}
                disabled={saving}
                className={SELECT_CLASS}
              >
                {(['normal','important_red','important_bold','critical'] as DisplayStyle[]).map((s) => (
                  <option key={s} value={s}>{DISPLAY_STYLE_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit_weight" className="text-xs">重み</Label>
              <Input
                id="edit_weight"
                type="number" step="0.1" min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          {/* 規程参照 */}
          <div className="space-y-1">
            <Label htmlFor="edit_regulation_ref" className="text-xs">規程・参照（任意）</Label>
            <Input
              id="edit_regulation_ref"
              value={regulation}
              onChange={(e) => setRegulation(e.target.value)}
              disabled={saving}
              placeholder="例: 労働安全衛生規則 §518"
            />
          </div>

          {/* 重要フラグ */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={isImportant}
              onChange={(e) => setIsImportant(e.target.checked)}
              disabled={saving}
              className="h-4 w-4"
            />
            <span><strong>重要項目</strong> (★ アイコン付き)</span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !itemText.trim()}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
