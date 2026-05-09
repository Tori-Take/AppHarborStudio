import Link from 'next/link'
import { scanCartridges } from '@/lib/cartridge-scanner'

export default async function AppsIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cartridges = scanCartridges()
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 64px' }}>
      <Link href="/" style={{ fontSize: 13, color: '#fbbf24', textDecoration: 'none' }}>← トップへ戻る</Link>
      <h1 style={{ fontSize: 24, marginTop: 16 }}>組織: {slug}</h1>
      <p style={{ color: '#94a3b8', fontSize: 14 }}>プレイするカートリッジを選んでください</p>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {cartridges.map((c) => (
          <Link
            key={c.id}
            href={`/org/${slug}/apps/${c.id}`}
            style={{
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 8, padding: 16, textDecoration: 'none', color: '#e2e8f0',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {c.manifest?.displayName ?? c.manifest?.name ?? c.id}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{c.id}</div>
          </Link>
        ))}
      </div>
    </main>
  )
}
