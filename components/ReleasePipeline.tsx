'use client'

import { useEffect, useState } from 'react'

type DeployInfo = {
  appId: string
  branch: string
  repoHead: string
  lastCommit: { fullSha: string; shortSha: string; date: string; author: string; subject: string } | null
  unpushedCount: number
  dirtyFiles: string[]
  github: { base: string; folderUrl: string | null; commitUrl: string | null } | null
  production: { baseUrl: string; platformUrl: string }
}

type ProdStatus = {
  sha:       string | null
  installed: boolean | null
}

type StageStatus = 'ok' | 'warn' | 'attention' | 'unknown' | 'na'

type Stage = {
  key:    'phase1' | 'phase2' | 'phase3'
  icon:   string
  title:  string
  subtitle: string
  status: StageStatus
  primary: string             // 主要表示テキスト（例: バージョン or 状態）
  detail:  string             // 補足
  action?: { label: string; href?: string; onClick?: () => void }
}

const STATUS_COLOR: Record<StageStatus, { fg: string; bg: string; border: string; chip: string }> = {
  ok:        { fg: '#34d399', bg: 'rgba(16, 185, 129, 0.10)',  border: 'rgba(16, 185, 129, 0.35)', chip: 'rgba(16, 185, 129, 0.20)' },
  warn:      { fg: '#fbbf24', bg: 'rgba(251, 191, 36, 0.10)',  border: 'rgba(251, 191, 36, 0.35)', chip: 'rgba(251, 191, 36, 0.20)' },
  attention: { fg: '#fca5a5', bg: 'rgba(239, 68, 68, 0.10)',   border: 'rgba(239, 68, 68, 0.35)',  chip: 'rgba(239, 68, 68, 0.20)' },
  unknown:   { fg: '#94a3b8', bg: 'rgba(148, 163, 184, 0.10)', border: 'rgba(148, 163, 184, 0.30)', chip: 'rgba(148, 163, 184, 0.20)' },
  na:        { fg: '#64748b', bg: 'rgba(100, 116, 139, 0.06)', border: 'rgba(100, 116, 139, 0.20)', chip: 'rgba(100, 116, 139, 0.15)' },
}

/**
 * カートリッジの 3 Phase 状態をパイプライン表示するコンポーネント。
 *
 * Phase 1 (ローカル) — git 作業ツリーの状態
 * Phase 2 (Studio Deploy) — main ブランチ HEAD（push 済みコード）の状態
 * Phase 3 (AppHarbor 本番) — 本番 git-sha と installed 状態
 *
 * docs/vision.md の「開発ワークフロー（3 Phase モデル）」に対応する UI。
 */
export function ReleasePipeline({ appId }: { appId: string }) {
  const [info, setInfo]         = useState<DeployInfo | null>(null)
  const [prod, setProd]         = useState<ProdStatus>({ sha: null, installed: null })
  const [refreshTick, setRefresh] = useState(0)

  // deploy-info を取得 + 30 秒ごとに更新
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`/api/cartridges/${encodeURIComponent(appId)}/deploy-info`)
        .then((r) => r.ok ? r.json() : null)
        .then((j: DeployInfo | null) => { if (!cancelled && j) setInfo(j) })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [appId, refreshTick])

  // 本番状態を取得
  useEffect(() => {
    if (!info) return
    let cancelled = false
    const base = info.production.baseUrl.replace(/\/$/, '')
    const fetchStatus = async () => {
      try {
        const [shaRes, installedRes] = await Promise.all([
          fetch(`${base}/api/git-sha?_=${Date.now()}`, { cache: 'no-store' }).catch(() => null),
          fetch(`${base}/api/apps/${encodeURIComponent(appId)}/installed?_=${Date.now()}`, { cache: 'no-store' }).catch(() => null),
        ])
        const sha = shaRes && shaRes.ok ? ((await shaRes.json()) as { sha: string }).sha : null
        const ins = installedRes && installedRes.ok ? ((await installedRes.json()) as { installed: boolean }).installed : null
        if (!cancelled) setProd({ sha, installed: ins })
      } catch { /* ignore */ }
    }
    fetchStatus()
    const t = setInterval(fetchStatus, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [info, appId, refreshTick])

  if (!info) {
    return (
      <section style={panel}>
        <div style={label}>🚀 リリースパイプライン</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>読み込み中...</div>
      </section>
    )
  }

  // ─── Phase 1: ローカル ──────────────────────────────────
  const hasDirty   = info.dirtyFiles.length > 0
  const hasUnpush  = info.unpushedCount > 0
  const phase1Status: StageStatus = hasDirty ? 'warn' : hasUnpush ? 'warn' : 'ok'
  const phase1Detail = hasDirty
    ? `未コミット ${info.dirtyFiles.length} ファイル`
    : hasUnpush
    ? `未 push コミット ${info.unpushedCount} 件`
    : `branch ${info.branch} と同期済み`
  const phase1Primary = info.lastCommit?.shortSha ?? '(no commits)'

  // ─── Phase 2: Studio Deploy ─────────────────────────────
  // 「main ブランチ HEAD」が Studio Deploy の対象。push 済みなら deployed 想定。
  const phase2Status: StageStatus = hasDirty
    ? 'attention'                         // ローカル未コミット → デプロイ反映前
    : hasUnpush
    ? 'attention'                         // 未 push → main 未反映
    : 'ok'
  const phase2Primary = info.repoHead.slice(0, 7)
  const phase2Detail  = hasUnpush
    ? `${info.unpushedCount} コミット未反映`
    : 'main HEAD に同期'

  // ─── Phase 3: AppHarbor 本番 ────────────────────────────
  let phase3Status: StageStatus = 'unknown'
  let phase3Primary = '取得中'
  let phase3Detail  = '本番情報を取得しています'
  if (prod.sha !== null) {
    phase3Primary = prod.sha.slice(0, 7)
    if (prod.installed === false) {
      phase3Status = 'na'
      phase3Detail = '本番に未インストール'
    } else if (prod.sha === info.repoHead) {
      phase3Status = 'ok'
      phase3Detail = '最新が本番で稼働中'
    } else {
      phase3Status = 'warn'
      phase3Detail = '本番が古いバージョン'
    }
  }

  const stages: Stage[] = [
    {
      key:      'phase1',
      icon:     '🛠',
      title:    'Phase 1',
      subtitle: 'ローカル',
      status:   phase1Status,
      primary:  phase1Primary,
      detail:   phase1Detail,
    },
    {
      key:      'phase2',
      icon:     '🎬',
      title:    'Phase 2',
      subtitle: 'Studio Deploy',
      status:   phase2Status,
      primary:  phase2Primary,
      detail:   phase2Detail,
      action:   info.github?.commitUrl ? { label: 'GitHub で開く', href: info.github.commitUrl } : undefined,
    },
    {
      key:      'phase3',
      icon:     '🚀',
      title:    'Phase 3',
      subtitle: 'AppHarbor 本番',
      status:   phase3Status,
      primary:  phase3Primary,
      detail:   phase3Detail,
      action:   { label: '本番を開く', href: info.production.platformUrl },
    },
  ]

  return (
    <section style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={label}>🚀 リリースパイプライン</div>
        <button
          onClick={() => setRefresh((t) => t + 1)}
          style={btnGhost}
          title="再取得"
        >
          🔄 更新
        </button>
      </div>

      {/* パイプライン本体 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        marginBottom: 12,
      }}>
        {stages.map((s, i) => {
          const c = STATUS_COLOR[s.status]
          return (
            <div
              key={s.key}
              style={{
                position: 'relative',
                padding: 12,
                borderRadius: 8,
                background: c.bg,
                border: `1px solid ${c.border}`,
              }}
            >
              {/* 矢印 (1, 2 段階の右側に表示) */}
              {i < stages.length - 1 && (
                <div style={{
                  position: 'absolute',
                  right: -10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 14,
                  color: '#64748b',
                  zIndex: 1,
                }}>
                  ›
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{s.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: c.fg, letterSpacing: 0.3 }}>
                  {s.title}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{s.subtitle}</span>
              </div>

              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#e2e8f0',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                marginBottom: 4,
              }}>
                {s.primary}
              </div>

              <div style={{ fontSize: 11, color: c.fg, marginBottom: s.action ? 8 : 0, lineHeight: 1.5 }}>
                {s.detail}
              </div>

              {s.action && s.action.href && (
                <a
                  href={s.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    fontSize: 10,
                    color: '#fbbf24',
                    textDecoration: 'none',
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(251, 191, 36, 0.10)',
                    border: '1px solid rgba(251, 191, 36, 0.25)',
                  }}
                >
                  {s.action.label} ↗
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Action Center: 次に何をすべきか */}
      <ActionCenter
        hasDirty={hasDirty}
        hasUnpush={hasUnpush}
        unpushedCount={info.unpushedCount}
        dirtyCount={info.dirtyFiles.length}
        phase3Status={phase3Status}
      />
    </section>
  )
}

/**
 * 「次に何をすべきか」を状態から判定して提案するボックス。
 */
function ActionCenter({
  hasDirty,
  hasUnpush,
  unpushedCount,
  dirtyCount,
  phase3Status,
}: {
  hasDirty: boolean
  hasUnpush: boolean
  unpushedCount: number
  dirtyCount: number
  phase3Status: StageStatus
}) {
  // 状態に応じてアクションを選ぶ
  let title: string
  let body:  string
  let tone:  'info' | 'warn' | 'ok' = 'info'

  if (hasDirty) {
    tone  = 'warn'
    title = `💡 ${dirtyCount} ファイルの未コミット変更があります`
    body  = '動作確認後、コミットして push すると Phase 2 (Studio Deploy) に反映されます。'
  } else if (hasUnpush) {
    tone  = 'warn'
    title = `📤 未 push のコミットが ${unpushedCount} 件あります`
    body  = 'push すると Phase 2 (Studio Deploy) に反映されます。'
  } else if (phase3Status === 'na') {
    tone  = 'info'
    title = '🚀 本番にインストールされていません'
    body  = 'AppHarbor 管理者が「アプリをインストール」する必要があります。'
  } else if (phase3Status === 'warn') {
    tone  = 'info'
    title = '🚀 Phase 3 (本番) が古いバージョンです'
    body  = 'AppHarbor 管理者が `npm run cartridge:release` で新バージョンを本番反映できます。'
  } else if (phase3Status === 'ok') {
    tone  = 'ok'
    title = '✅ Phase 1〜3 すべて同期済み'
    body  = '本番が最新コードで稼働中です。次の機能開発を始められます。'
  } else {
    title = '✓ ローカルは clean'
    body  = '本番状態を取得中...'
  }

  const c = tone === 'ok'   ? { fg: '#34d399', bg: 'rgba(16, 185, 129, 0.08)',  border: 'rgba(16, 185, 129, 0.30)' }
          : tone === 'warn' ? { fg: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)',  border: 'rgba(251, 191, 36, 0.30)' }
          :                   { fg: '#93c5fd', bg: 'rgba(59, 130, 246, 0.08)',  border: 'rgba(59, 130, 246, 0.30)' }

  return (
    <div style={{
      padding: 10,
      borderRadius: 6,
      background: c.bg,
      border: `1px solid ${c.border}`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: c.fg, marginBottom: 4 }}>
        🎯 次のアクション · {title}
      </div>
      <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.6 }}>
        {body}
      </div>
    </div>
  )
}

// ─── styles ──────────────────────────────────────────────
const panel: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
}

const label: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  cursor: 'pointer',
}
