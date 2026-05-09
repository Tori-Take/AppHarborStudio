'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const STEP_STORAGE_KEY = (appId: string) => `appharbor_studio_step_${appId}`

/** 表示名や生入力から ID 候補を作る（半角英数とハイフンのみに整形） */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Step ① 用の新規カートリッジ作成フォーム。
 * 旧 NewCartridgeButton ダイアログの中身を切り出して、フルページに展開できる形に。
 */
export function Step1CreateForm() {
  const router = useRouter()
  const [name, setName]   = useState('')
  const [id, setId]       = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [desc, setDesc]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState<string | null>(null)

  const effectiveId = idTouched ? id : slugify(name)

  const checks = useMemo(() => ({
    length:  effectiveId.length >= 2 && effectiveId.length <= 40,
    charset: /^[a-z0-9-]*$/.test(effectiveId) && effectiveId.length > 0,
    start:   /^[a-z]/.test(effectiveId),
  }), [effectiveId])
  const idValid = checks.length && checks.charset && checks.start

  const submit = async () => {
    if (!idValid || busy) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/cartridges/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: effectiveId, name: name.trim() || effectiveId, description: desc.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? `作成失敗（HTTP ${res.status}）`)
        setBusy(false)
        return
      }
      // 作成成功: 次のステップ② に進める状態で遷移
      try { localStorage.setItem(STEP_STORAGE_KEY(effectiveId), '2') } catch { /* ignore */ }
      router.push(`/cartridge/${encodeURIComponent(effectiveId)}`)
      router.refresh()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <section style={panel}>
      <div style={label}>新しいアプリを作る</div>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px' }}>
        アプリの雛形フォルダを生成します。あとで Claude Code に開発を任せられます。
      </p>

      <Field label="アプリ名" hint="人が見る名前（例: タイピング練習）">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: タイピング練習"
          autoFocus
          disabled={busy}
          style={inputStyle}
        />
      </Field>

      <Field label="識別子" hint="URL やフォルダ名に使う英数字（自動候補が入ります）">
        <input
          value={effectiveId}
          onChange={(e) => { setId(slugify(e.target.value)); setIdTouched(true) }}
          onBlur={() => { if (id) setId(slugify(id)) }}
          placeholder="例: typing-practice"
          disabled={busy}
          style={{
            ...inputStyle,
            fontFamily: 'ui-monospace, monospace',
            borderColor: effectiveId.length === 0
              ? '#334155'
              : idValid ? '#10b981' : '#ef4444',
          }}
        />
        <ul style={ruleList}>
          <Rule ok={checks.charset}>半角の英数字（a-z, 0-9）とハイフン（-）のみ</Rule>
          <Rule ok={checks.start}>先頭は英字（a〜z）から始める</Rule>
          <Rule ok={checks.length}>2〜40 文字</Rule>
        </ul>
        {idValid && (
          <div style={preview}>
            URL: <code style={{ color: '#fbbf24' }}>/org/&lt;組織&gt;/apps/{effectiveId}</code>
          </div>
        )}
      </Field>

      <Field label="説明" hint="任意 — 後から変更できます">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="例: ローマ字タイピングの練習アプリ"
          disabled={busy}
          style={inputStyle}
        />
      </Field>

      {err && (
        <div style={{
          color: '#fca5a5', background: '#7f1d1d33',
          border: '1px solid #7f1d1d', borderRadius: 6,
          padding: '8px 10px', fontSize: 12, marginTop: 8,
        }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button
          onClick={() => router.push('/')}
          disabled={busy}
          style={btnGhost}
        >
          キャンセル
        </button>
        <button
          onClick={submit}
          disabled={busy || !idValid}
          style={{ ...btnPrimary, opacity: (busy || !idValid) ? 0.5 : 1 }}
        >
          {busy ? '確定中...' : '✓ アプリ情報を確定'}
        </button>
      </div>
    </section>
  )
}

const panel: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: 20,
  marginBottom: 12,
}

const label: React.CSSProperties = {
  fontSize: 12, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: 0.5,
  marginBottom: 8,
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0f172a', color: '#e2e8f0',
  border: '1px solid #334155', borderRadius: 6, padding: '6px 10px',
  fontSize: 14, marginTop: 4, boxSizing: 'border-box',
}

const ruleList: React.CSSProperties = {
  margin: '8px 0 0', padding: 0, listStyle: 'none',
  fontSize: 11,
}

const preview: React.CSSProperties = {
  marginTop: 6, fontSize: 11, color: '#94a3b8',
  fontFamily: 'ui-monospace, monospace',
}

const btnPrimary: React.CSSProperties = {
  background: '#fbbf24', color: '#1f2937',
  border: 'none', borderRadius: 6, padding: '8px 16px',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
}

const btnGhost: React.CSSProperties = {
  background: 'transparent', color: '#94a3b8',
  border: '1px solid #334155', borderRadius: 6, padding: '8px 14px',
  fontSize: 13, cursor: 'pointer',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14, fontSize: 13, color: '#cbd5e1', fontWeight: 500 }}>
      {label}
      {hint && <span style={{ marginLeft: 8, color: '#64748b', fontSize: 11, fontWeight: 400 }}>{hint}</span>}
      {children}
    </label>
  )
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li style={{ color: ok ? '#10b981' : '#94a3b8', display: 'flex', gap: 6, marginTop: 2 }}>
      <span style={{ width: 12, textAlign: 'center' }}>{ok ? '✓' : '○'}</span>
      <span>{children}</span>
    </li>
  )
}
