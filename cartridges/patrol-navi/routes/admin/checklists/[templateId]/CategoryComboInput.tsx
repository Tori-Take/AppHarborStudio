'use client'

import { useEffect, useRef, useState } from 'react'

const INPUT_CLASS = 'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'

type Props = {
  id:           string
  value:        string
  onChange:     (v: string) => void
  options:      string[]
  placeholder?: string
  disabled?:    boolean
  inputRef?:    React.Ref<HTMLInputElement>
}

export function CategoryComboInput({ id, value, onChange, options, placeholder, disabled, inputRef }: Props) {
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setTyping(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const shown = typing
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase()))
    : options

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => { onChange(e.target.value); setTyping(true); setOpen(true) }}
        onFocus={() => { setOpen(true); setTyping(false) }}
        disabled={disabled}
        placeholder={placeholder}
        className={INPUT_CLASS}
        autoComplete="off"
      />
      {open && shown.length > 0 && (
        <div className="absolute z-[9999] mt-1 w-full max-h-40 overflow-y-auto rounded-md border bg-popover py-1 shadow-md">
          {shown.map(o => (
            <button
              key={o}
              type="button"
              className={`w-full px-2.5 py-1.5 text-left text-sm hover:bg-accent truncate ${o === value ? 'font-semibold text-foreground bg-accent/50' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(o)
                setOpen(false)
                setTyping(false)
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
