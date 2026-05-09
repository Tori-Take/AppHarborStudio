'use client'

/**
 * Studio Inspector — DB ブラウザ / SQL コンソール / クエリログ
 *
 * 開発支援ツール。新しいタブで開いて、カートリッジ動作テスト中に
 * 何が DB に書かれたか / どんな SQL が走ったかを確認するのに使う。
 */

import { useEffect, useRef, useState } from 'react'

type TableInfo = { schema: string; name: string; rows: number }
type QueryLog = {
  id: string; ts: number; sql: string; params?: unknown[]
  rowCount?: number; ms: number; error?: string; source?: string
}

export default function InspectorPage() {
  const [tab, setTab] = useState<'browser' | 'sql' | 'log'>('browser')

  return (
    <div style={{
      minHeight: '100vh', background: '#0b1322', color: '#e2e8f0',
      fontFamily: 'system-ui, sans-serif', fontSize: 13,
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', borderBottom: '1px solid #1e293b',
      }}>
        <strong style={{ color: '#fbbf24' }}>🔬 Studio Inspector</strong>
        <nav style={{ display: 'flex', gap: 4 }}>
          {(['browser', 'sql', 'log'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? '#fbbf24' : 'transparent',
              color:      tab === t ? '#0b1322' : '#94a3b8',
              border:     '1px solid ' + (tab === t ? '#fbbf24' : '#334155'),
              padding: '4px 10px', borderRadius: 4, fontSize: 12,
              fontWeight: tab === t ? 700 : 400, cursor: 'pointer',
            }}>
              {t === 'browser' ? '📊 DB ブラウザ' : t === 'sql' ? '⚡ SQL' : '📜 ログ'}
            </button>
          ))}
        </nav>
      </header>
      <main style={{ padding: 16 }}>
        {tab === 'browser' && <DbBrowser />}
        {tab === 'sql'     && <SqlConsole />}
        {tab === 'log'     && <QueryLogPanel />}
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────
// DB ブラウザ
// ─────────────────────────────────────────────
function DbBrowser() {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [data, setData] = useState<{
    schema: string; table: string; total: number; limit: number; offset: number
    rows: Record<string, unknown>[]
    fields: { name: string }[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetch('/api/db/tables').then((r) => r.json()).then(setTables)
  }, [])

  const loadTable = async (key: string, offset = 0) => {
    setSelected(key)
    setLoading(true)
    try {
      const r = await fetch(`/api/db/tables/${encodeURIComponent(key)}?limit=50&offset=${offset}`)
      const j = await r.json()
      if (j.error) {
        setData(null)
        alert(`読込エラー: ${j.error}`)
      } else {
        setData(j)
      }
    } finally { setLoading(false) }
  }

  const grouped = tables.reduce<Record<string, TableInfo[]>>((acc, t) => {
    if (!filter || t.name.includes(filter) || t.schema.includes(filter)) {
      (acc[t.schema] ??= []).push(t)
    }
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 80px)' }}>
      <aside style={{
        width: 240, flexShrink: 0, overflowY: 'auto',
        border: '1px solid #1e293b', borderRadius: 6, padding: 8,
      }}>
        <input
          placeholder="🔍 テーブル絞込..."
          value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', marginBottom: 8,
            background: '#0f172a', border: '1px solid #334155',
            color: '#e2e8f0', padding: '4px 6px', borderRadius: 4, fontSize: 12,
          }}
        />
        {Object.entries(grouped).map(([schema, list]) => (
          <div key={schema} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{schema}</div>
            {list.map((t) => {
              const key = `${t.schema}.${t.name}`
              return (
                <button
                  key={key}
                  onClick={() => loadTable(key)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', textAlign: 'left',
                    background: selected === key ? 'rgba(251,191,36,0.15)' : 'transparent',
                    color: selected === key ? '#fbbf24' : '#e2e8f0',
                    border: 'none', padding: '3px 6px', fontSize: 12, cursor: 'pointer',
                    borderRadius: 4,
                  }}
                >
                  <span>{t.name}</span>
                  <span style={{ fontSize: 10, color: '#64748b' }}>{Math.round(t.rows)}</span>
                </button>
              )
            })}
          </div>
        ))}
      </aside>
      <section style={{ flex: 1, minWidth: 0, overflow: 'auto', border: '1px solid #1e293b', borderRadius: 6 }}>
        {!data ? (
          <div style={{ padding: 24, color: '#64748b', fontSize: 12 }}>
            {loading ? '読込中…' : '左のテーブル一覧から選択してください'}
          </div>
        ) : (
          <>
            <div style={{ padding: '6px 12px', fontSize: 11, color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
              <code>{data.schema}.{data.table}</code> — {data.rows.length} / {data.total} 行
              {data.total > data.limit && (
                <span style={{ marginLeft: 8 }}>
                  <button onClick={() => loadTable(`${data.schema}.${data.table}`, Math.max(0, data.offset - data.limit))}
                    disabled={data.offset === 0} style={pagerBtn}>← 前</button>
                  <button onClick={() => loadTable(`${data.schema}.${data.table}`, data.offset + data.limit)}
                    disabled={data.offset + data.limit >= data.total} style={pagerBtn}>次 →</button>
                  <span style={{ marginLeft: 8, color: '#64748b' }}>offset={data.offset}</span>
                </span>
              )}
            </div>
            <DataTable rows={data.rows} fields={data.fields} />
          </>
        )}
      </section>
    </div>
  )
}

const pagerBtn: React.CSSProperties = {
  marginLeft: 4, background: 'transparent', color: '#94a3b8',
  border: '1px solid #334155', borderRadius: 3, fontSize: 11,
  padding: '1px 6px', cursor: 'pointer',
}

function DataTable({ rows, fields }: { rows: Record<string, unknown>[]; fields: { name: string }[] }) {
  if (rows.length === 0) {
    return <div style={{ padding: 24, color: '#64748b', fontSize: 12 }}>(行がありません)</div>
  }
  const cols = fields.length > 0 ? fields.map((f) => f.name) : Object.keys(rows[0])
  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace', width: '100%' }}>
        <thead>
          <tr style={{ background: '#0f172a' }}>
            {cols.map((c) => (
              <th key={c} style={{
                padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #1e293b',
                position: 'sticky', top: 0, background: '#0f172a', color: '#fbbf24',
                whiteSpace: 'nowrap',
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
              {cols.map((c) => (
                <td key={c} style={{ padding: '3px 8px', verticalAlign: 'top', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatCell(v: unknown): string {
  if (v == null) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ─────────────────────────────────────────────
// SQL コンソール
// ─────────────────────────────────────────────
const SQL_HISTORY_KEY = 'studio-inspector-sql-history'

function SqlConsole() {
  const [sql, setSql] = useState('SELECT id, slug, name FROM organizations;')
  const [result, setResult] = useState<{
    ok: boolean; ms: number;
    rows?: Record<string, unknown>[]; fields?: { name: string }[]
    error?: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SQL_HISTORY_KEY)
      if (raw) setHistory(JSON.parse(raw))
    } catch { /* */ }
  }, [])

  const run = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/db/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql }),
      })
      const j = await r.json()
      setResult(j)
      if (j.ok) {
        const next = [sql, ...history.filter((h) => h !== sql)].slice(0, 10)
        setHistory(next)
        localStorage.setItem(SQL_HISTORY_KEY, JSON.stringify(next))
      }
    } finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run() }
          }}
          rows={5}
          style={{
            flex: 1, fontFamily: 'monospace', fontSize: 12,
            background: '#0f172a', color: '#e2e8f0',
            border: '1px solid #334155', borderRadius: 4, padding: 8,
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={run} disabled={loading || !sql.trim()} style={{
            background: '#fbbf24', color: '#0b1322', border: 'none',
            padding: '8px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
          }}>
            {loading ? '...' : '▶ 実行'}
          </button>
          <span style={{ fontSize: 10, color: '#64748b', textAlign: 'center' }}>⌘/Ctrl + Enter</span>
        </div>
      </div>

      {history.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 11, color: '#94a3b8' }}>履歴 ({history.length})</summary>
          {history.map((h, i) => (
            <button key={i} onClick={() => setSql(h)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: 'transparent', border: '1px solid #1e293b',
              color: '#94a3b8', fontSize: 11, fontFamily: 'monospace',
              padding: '4px 8px', borderRadius: 3, cursor: 'pointer',
              marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{h}</button>
          ))}
        </details>
      )}

      {result && (
        <div style={{ border: '1px solid #1e293b', borderRadius: 6 }}>
          <div style={{ padding: '4px 12px', fontSize: 11, borderBottom: '1px solid #1e293b' }}>
            {result.ok ? (
              <span style={{ color: '#34d399' }}>✓ OK · {result.ms} ms · {result.rows?.length ?? 0} 行</span>
            ) : (
              <span style={{ color: '#f87171' }}>✗ エラー · {result.ms} ms</span>
            )}
          </div>
          {result.ok && result.rows ? (
            <DataTable rows={result.rows} fields={result.fields ?? []} />
          ) : (
            <pre style={{ padding: 12, color: '#fca5a5', fontSize: 11, whiteSpace: 'pre-wrap' }}>{result.error}</pre>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// クエリログ
// ─────────────────────────────────────────────
function QueryLogPanel() {
  const [logs, setLogs] = useState<QueryLog[]>([])
  const [auto, setAuto] = useState(true)
  const sinceRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (stopped) return
      try {
        const r = await fetch('/api/db/log' + (sinceRef.current ? `?since=${sinceRef.current}` : ''))
        const j: QueryLog[] = await r.json()
        if (j.length > 0) {
          setLogs((prev) => [...prev, ...j].slice(-200))
          sinceRef.current = j[j.length - 1].id
        }
      } catch { /* */ }
      if (auto) timer = setTimeout(tick, 1000)
    }
    if (auto) tick()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [auto])

  const clear = async () => {
    await fetch('/api/db/log', { method: 'DELETE' })
    setLogs([])
    sinceRef.current = undefined
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          自動更新 (1 秒ごと)
        </label>
        <button onClick={clear} style={{
          background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
          padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
        }}>🧹 ログクリア</button>
        <span style={{ fontSize: 11, color: '#64748b' }}>{logs.length} 件</span>
      </div>
      <div style={{ border: '1px solid #1e293b', borderRadius: 6, overflow: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
        {logs.length === 0 ? (
          <div style={{ padding: 24, color: '#64748b', fontSize: 12, textAlign: 'center' }}>
            (ログがまだありません — Studio で起動したカートリッジを操作するとここに流れます)
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 11, fontFamily: 'monospace' }}>
            <thead>
              <tr style={{ background: '#0f172a' }}>
                <th style={thStyle}>時刻</th>
                <th style={thStyle}>ms</th>
                <th style={thStyle}>行</th>
                <th style={thStyle}>SQL</th>
              </tr>
            </thead>
            <tbody>
              {[...logs].reverse().map((l) => {
                const op = l.sql.trim().slice(0, 6).toUpperCase()
                const color = l.error ? '#f87171'
                  : op.startsWith('SELECT') ? '#94a3b8'
                  : op.startsWith('INSERT') || op.startsWith('UPDATE') || op.startsWith('DELETE') ? '#fbbf24'
                  : '#67e8f9'
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ ...tdStyle, color: '#64748b', whiteSpace: 'nowrap' }}>
                      {new Date(l.ts).toLocaleTimeString('ja-JP')}
                    </td>
                    <td style={{ ...tdStyle, color: '#94a3b8', textAlign: 'right' }}>{l.ms}</td>
                    <td style={{ ...tdStyle, color: '#94a3b8', textAlign: 'right' }}>{l.rowCount ?? ''}</td>
                    <td style={{ ...tdStyle, color, whiteSpace: 'pre-wrap', maxWidth: 800 }}>
                      {l.sql}
                      {l.error && <div style={{ color: '#f87171', marginTop: 2 }}>→ {l.error}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #1e293b',
  color: '#fbbf24', position: 'sticky', top: 0, background: '#0f172a',
}
const tdStyle: React.CSSProperties = {
  padding: '3px 8px', verticalAlign: 'top',
}
