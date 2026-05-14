'use client'

import { useEffect, useState } from 'react'

type AiContext = {
  sdk: {
    version: string
    types:   string | null
    index:   string | null
    client:  string | null
    readme:  string | null
  }
  cartridge: {
    id:       string
    claudeMd: string | null
    manifest: unknown
  }
}

type Section = 'overview' | 'sdk-types' | 'sdk-functions' | 'cartridge-rules' | 'rules'

const SECTIONS: { key: Section; label: string; hint: string }[] = [
  { key: 'overview',        label: 'プラットフォーム概要 + 使い方', hint: 'SDK README (公開 API と例)' },
  { key: 'sdk-types',       label: 'SDK 型定義',                  hint: 'types.ts (Actor, AppContext 等)' },
  { key: 'sdk-functions',   label: 'SDK 関数シグネチャ',          hint: 'index.ts + client.ts (requireApp 等)' },
  { key: 'cartridge-rules', label: 'このカートリッジ固有の指示',  hint: 'cartridges/<id>/CLAUDE.md' },
  { key: 'rules',           label: 'マルチテナント設計の鉄則',    hint: 'organization_id / RLS の必須ルール' },
]

const DEFAULT_SELECTED: Set<Section> = new Set([
  'overview', 'sdk-types', 'sdk-functions', 'cartridge-rules', 'rules',
])

/**
 * AI (Claude Code 等) に渡すコンテキストを組み立てるパネル。
 *
 * - チェックを ON/OFF してセクションを選ぶ
 * - 📋 でクリップボードに 1 つの巨大プロンプトとしてコピー
 * - プレビュー表示も可能 (折りたたみ)
 */
export function AiContextPanel({ appId }: { appId: string }) {
  const [ctx,      setCtx]      = useState<AiContext | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<Section>>(DEFAULT_SELECTED)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [copied,   setCopied]   = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/cartridges/${encodeURIComponent(appId)}/ai-context`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error ?? `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((j: AiContext) => { if (!cancelled) setCtx(j) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [appId])

  const toggle = (key: Section) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const buildPrompt = (): string => {
    if (!ctx) return ''
    const parts: string[] = []

    parts.push('# AppHarbor カートリッジ開発 — AI 向けコンテキスト\n')
    parts.push(`このプロンプトは Studio が組み立てた背景情報です。`)
    parts.push(`このリポジトリのコードを書く前に、以下の規約と SDK 仕様を理解してください。`)
    parts.push(`使用 SDK: \`@appharbor/sdk@${ctx.sdk.version}\`\n`)

    if (selected.has('overview') && ctx.sdk.readme) {
      parts.push('---\n')
      parts.push('## 1. プラットフォーム概要 + 使い方\n')
      parts.push(ctx.sdk.readme)
      parts.push('')
    }

    if (selected.has('sdk-types') && ctx.sdk.types) {
      parts.push('---\n')
      parts.push('## 2. SDK 型定義 (`@appharbor/sdk/types`)\n')
      parts.push('```typescript')
      parts.push(ctx.sdk.types.trim())
      parts.push('```\n')
    }

    if (selected.has('sdk-functions') && (ctx.sdk.index || ctx.sdk.client)) {
      parts.push('---\n')
      parts.push('## 3. SDK 関数シグネチャ\n')
      if (ctx.sdk.index) {
        parts.push('### サーバーサイド (`@appharbor/sdk`)')
        parts.push('```typescript')
        parts.push(ctx.sdk.index.trim())
        parts.push('```\n')
      }
      if (ctx.sdk.client) {
        parts.push('### ブラウザサイド (`@appharbor/sdk/client`)')
        parts.push('```typescript')
        parts.push(ctx.sdk.client.trim())
        parts.push('```\n')
      }
    }

    if (selected.has('cartridge-rules') && ctx.cartridge.claudeMd) {
      parts.push('---\n')
      parts.push(`## 4. このカートリッジ (\`${ctx.cartridge.id}\`) 固有の指示\n`)
      parts.push(ctx.cartridge.claudeMd)
      parts.push('')
    }

    if (selected.has('rules')) {
      parts.push('---\n')
      parts.push('## 5. マルチテナント設計の鉄則\n')
      parts.push('AppHarbor はマルチテナント B2B プラットフォームです。以下のルールは厳守してください:\n')
      parts.push('- **全テーブルに `organization_id uuid REFERENCES organizations(id)` を持たせる**')
      parts.push('- **RLS ポリシーで `organization_id = (auth.jwt() ->> \'organization_id\')::uuid` を必ず設定**')
      parts.push('- **全クエリ (SELECT / INSERT / UPDATE / DELETE) で `.eq(\'organization_id\', ctx.actor.organizationId)` を必ず付ける**')
      parts.push('- **テーブルに `updated_at` を持たせ、`update_updated_at()` トリガで自動更新**')
      parts.push('- **db/schema.sql を単一ソースとし、AppHarbor 共通テーブル (organizations / profiles 等) は定義しない**')
      parts.push('- **manifest.json の `permissions` でアプリ内ロールを宣言する**')
      parts.push('')
      parts.push('テナント越境はセキュリティ事故です。テスト時に他組織のデータが見えていたら即座に修正してください。')
      parts.push('')
    }

    return parts.join('\n')
  }

  const handleCopy = async () => {
    const text = buildPrompt()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('クリップボードへのコピーに失敗しました。')
    }
  }

  if (error) {
    return (
      <section style={errorPanel}>
        <div style={label}>🤖 AI 開発コンテキスト</div>
        <p style={{ fontSize: 13, color: '#fca5a5', margin: '8px 0 0' }}>
          コンテキストを取得できませんでした: {error}
        </p>
      </section>
    )
  }

  if (!ctx) {
    return (
      <section style={panel}>
        <div style={label}>🤖 AI 開発コンテキスト</div>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0 0' }}>読み込み中...</p>
      </section>
    )
  }

  const promptLength = buildPrompt().length

  return (
    <section style={panel}>
      <div style={label}>🤖 AI 開発コンテキスト</div>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.7 }}>
        Claude Code に貼り付けて使う「カートリッジ開発の前提知識」を生成します。
        SDK <code style={{ color: '#fbbf24' }}>@appharbor/sdk@{ctx.sdk.version}</code> の契約と、このカートリッジ固有の指示が含まれます。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {SECTIONS.map((s) => {
          const checked = selected.has(s.key)
          const available =
            (s.key === 'overview' && !!ctx.sdk.readme)
            || (s.key === 'sdk-types' && !!ctx.sdk.types)
            || (s.key === 'sdk-functions' && !!(ctx.sdk.index || ctx.sdk.client))
            || (s.key === 'cartridge-rules' && !!ctx.cartridge.claudeMd)
            || s.key === 'rules'

          return (
            <label
              key={s.key}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                fontSize: 12, color: available ? '#cbd5e1' : '#64748b',
                cursor: available ? 'pointer' : 'not-allowed',
                opacity: available ? 1 : 0.5,
              }}
            >
              <input
                type="checkbox"
                checked={checked && available}
                disabled={!available}
                onChange={() => toggle(s.key)}
                style={{ marginTop: 2 }}
              />
              <span>
                <strong>{s.label}</strong>
                <span style={{ color: '#64748b', marginLeft: 8, fontSize: 11 }}>
                  — {s.hint}
                  {!available && ' (ファイル無し)'}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={handleCopy} style={btnPrimary}>
          {copied ? '✓ コピーしました' : '📋 クリップボードにコピー'}
        </button>
        <button
          onClick={() => setPreviewOpen((v) => !v)}
          style={btnGhost}
        >
          {previewOpen ? '▲ プレビューを閉じる' : '▼ プレビューを開く'}
        </button>
        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
          約 {promptLength.toLocaleString()} 文字 / 推定 {Math.ceil(promptLength / 4).toLocaleString()} トークン
        </span>
      </div>

      {previewOpen && (
        <pre style={{
          marginTop: 12, padding: 12,
          background: '#0f172a', border: '1px solid #334155',
          borderRadius: 6, color: '#e2e8f0',
          fontSize: 11, lineHeight: 1.6,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          maxHeight: 400, overflow: 'auto',
          whiteSpace: 'pre-wrap',
        }}>
          {buildPrompt()}
        </pre>
      )}
    </section>
  )
}

const panel: React.CSSProperties = {
  background: 'rgba(96, 165, 250, 0.06)',
  border: '1px solid rgba(96, 165, 250, 0.35)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
}

const errorPanel: React.CSSProperties = {
  ...panel,
  background: 'rgba(239, 68, 68, 0.06)',
  border: '1px solid rgba(239, 68, 68, 0.35)',
}

const label: React.CSSProperties = {
  fontSize: 12,
  color: '#60a5fa',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 8,
  fontWeight: 600,
}

const btnPrimary: React.CSSProperties = {
  background: '#60a5fa',
  color: '#0f172a',
  border: 'none',
  borderRadius: 6,
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 12,
  cursor: 'pointer',
}
