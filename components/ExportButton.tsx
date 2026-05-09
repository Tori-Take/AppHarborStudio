'use client'

export function ExportButton({ appId }: { appId: string }) {
  return (
    <section style={panelStyle}>
      <div style={labelStyle}>📦 配布パッケージ</div>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px' }}>
        このカートリッジを <code>.appcart.json</code> ファイルとして出力します。
        AppHarbor の「JSON で取り込み」から install できます。
      </p>
      <a
        href={`/api/cartridges/${encodeURIComponent(appId)}/export`}
        download
        style={{
          display: 'inline-block',
          background: '#fbbf24', color: '#1f2937',
          borderRadius: 6, padding: '8px 16px',
          fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}
      >
        ⬇ .appcart.json をダウンロード
      </a>
    </section>
  )
}

const panelStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 8,
  fontWeight: 600,
}
