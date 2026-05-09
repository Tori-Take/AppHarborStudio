import Link from 'next/link'
import { Step1CreateForm } from '@/components/Step1CreateForm'

/**
 * 新規カートリッジ作成ページ。
 *
 * 「Step ① アプリ情報」の入力に特化したフルページ。
 * フォーム送信が成功すると /cartridge/<id> へ遷移し、Step ② から開発が始まる。
 */
export default function NewCartridgePage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 64px' }}>
      <Link href="/" style={{ fontSize: 13, color: '#fbbf24', textDecoration: 'none' }}>
        ← カートリッジ一覧へ戻る
      </Link>

      <header style={{ marginTop: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>新しいアプリを作る</h1>
        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 6 }}>
          Step ① アプリ情報 — 名前と識別子を決めて雛形を生成します。
        </p>
      </header>

      {/* シンプルなステッパー表示（① だけ強調、②③ はグレー） */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        marginBottom: 20,
        background: '#0f172a', border: '1px solid #334155',
        borderRadius: 8, padding: 6,
      }}>
        <StepIndicator num={1} label="アプリ情報"     sub="名前・識別子・説明"      state="active" />
        <Connector />
        <StepIndicator num={2} label="AI と開発"     sub="Claude Code に依頼"     state="upcoming" />
        <Connector />
        <StepIndicator num={3} label="動作確認・公開" sub="プレイ・push・配布"     state="upcoming" />
      </div>

      <Step1CreateForm />
    </main>
  )
}

function StepIndicator({
  num, label, sub, state,
}: {
  num: number
  label: string
  sub: string
  state: 'active' | 'upcoming' | 'done'
}) {
  return (
    <div style={{
      flex: 1,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px',
      borderRadius: 6,
      background: state === 'active' ? '#1e293b' : 'transparent',
      color: state === 'active' ? '#fbbf24' : state === 'done' ? '#10b981' : '#64748b',
      opacity: state === 'upcoming' ? 0.5 : 1,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: '50%',
        background: state === 'active' ? '#fbbf24' : state === 'done' ? '#10b981' : '#334155',
        color: state === 'active' || state === 'done' ? '#0f172a' : '#94a3b8',
        fontSize: 12, fontWeight: 700,
      }}>
        {state === 'done' ? '✓' : num}
      </span>
      <span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>{sub}</span>
      </span>
    </div>
  )
}

function Connector() {
  return (
    <span style={{ width: 16, height: 1, background: '#334155', margin: '0 4px' }} />
  )
}
