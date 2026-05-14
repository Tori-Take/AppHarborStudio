import Link from 'next/link'
import { notFound } from 'next/navigation'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'
import { LintPanel } from '@/components/LintPanel'
import { ExportButton } from '@/components/ExportButton'
import { AiDevPanel } from '@/components/AiDevPanel'
import { PlayButton } from '@/components/PlayButton'
import { DeployInfoPanel } from '@/components/DeployInfoPanel'
import { ResetCartridgeButton } from '@/components/ResetCartridgeButton'
import { PublishedBadge } from '@/components/PublishedBadge'
import { ReleasePipeline } from '@/components/ReleasePipeline'
import { CartridgeWorkbench } from '@/components/CartridgeWorkbench'

/** db/schema.sql から create table 文を抽出（コメント除外） */
function extractTablesFromSchema(cartridgePath: string): string[] {
  const schemaPath = join(cartridgePath, 'db', 'schema.sql')
  if (!existsSync(schemaPath)) return []
  const sql = readFileSync(schemaPath, 'utf-8')
  const noComments = sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?[a-zA-Z0-9_]+"?\.)?"?([a-zA-Z0-9_]+)"?/gi
  const names = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(noComments)) !== null) names.add(m[1])
  return [...names]
}

export default async function CartridgePage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const c = getCartridge(decodeURIComponent(appId))
  if (!c) notFound()

  const schemaTables    = extractTablesFromSchema(c.path)
  const manifestTables  = Array.isArray((c.manifest as { tables?: unknown })?.tables)
    ? ((c.manifest as { tables?: string[] }).tables ?? [])
    : []
  const needsDb         = schemaTables.length > 0
  const tablesOutOfSync = needsDb && (
    schemaTables.length !== manifestTables.length ||
    schemaTables.some((t) => !manifestTables.includes(t))
  )

  // ───────── 開発モード (Phase 1) のコンテンツ ─────────
  // ステッパーをやめてフラットに並べる。ModeTabs で「開発フェーズ」と分かっているので
  // sub-step による段階表示は冗長だった。
  const developSection = (
    <>
      <section style={panelStyle}>
        <div style={labelStyle}>アプリ情報</div>
        {c.manifest ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            <Row label="アプリ名">
              <span style={{ color: '#e2e8f0' }}>
                {(c.manifest.name as string) ?? c.manifest.displayName ?? c.id}
              </span>
            </Row>
            <Row label="識別子">
              <code style={{ color: '#fbbf24' }}>{c.id}</code>
            </Row>
            {c.manifest.description != null && String(c.manifest.description) && (
              <Row label="説明">
                <span style={{ color: '#cbd5e1' }}>{String(c.manifest.description)}</span>
              </Row>
            )}
            {c.manifest.version != null && (
              <Row label="バージョン">
                <code style={{ color: '#94a3b8' }}>v{String(c.manifest.version)}</code>
              </Row>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#fca5a5', margin: 0 }}>
            manifest.json が見つかりません。新規作成フォームは Phase 2 で実装予定。
          </p>
        )}
        <p style={{ fontSize: 11, color: '#64748b', marginTop: 12, marginBottom: 0 }}>
          ※ 現状は読み取り専用です。編集は <code>cartridges/{c.id}/manifest.json</code> を直接書き換えてください。
        </p>
      </section>

      <AiDevPanel appId={c.id} path={c.path} />

      <section style={{
        ...panelStyle,
        background: '#1a2436',
        border: '1px dashed #475569',
      }}>
        <div style={{ ...labelStyle, color: '#94a3b8' }}>
          開発の進め方
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.9, color: '#cbd5e1' }}>
          <li>上の「<strong>エクスプローラーで開く</strong>」でフォルダを開く</li>
          <li>そのフォルダを <strong>Claude Code</strong> で開いて開発を依頼する<br/>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              （フォルダ内の <code>CLAUDE.md</code> を AI が読み、まずロールと DB 要否を確認します）
            </span>
          </li>
          <li>下の「▶ ローカルプレイ」で動作確認</li>
        </ol>
      </section>

      <section style={{ ...panelStyle, borderColor: c.manifest?.studioCompatible === false ? '#ef4444' : '#60a5fa' }}>
        <div style={{ ...labelStyle, color: c.manifest?.studioCompatible === false ? '#ef4444' : '#60a5fa' }}>
          ▶ ローカルプレイ (Phase 1)
        </div>
        {c.manifest?.studioCompatible === false ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 14, color: '#ef4444', fontWeight: 600 }}>Studio 非対応カートリッジ</div>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0 0' }}>
              {c.manifest.studioCompatibleNote ?? 'このカートリッジは規約違反の依存があるため Studio で起動できません。'}
            </p>
          </div>
        ) : c.hasRoutes ? (
          <PlayButton appId={c.id} />
        ) : (
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0 0' }}>
            routes/ がないため起動できません
          </p>
        )}
        <p style={{ fontSize: 12, color: '#64748b', margin: '12px 0 0' }}>
          DB は PGlite ファイル永続化。リセットは <code>studio/.studio-db/</code> を削除。
        </p>
        <ResetCartridgeButton appId={c.id} />
      </section>
    </>
  )

  // ───────── プレビューモード (Phase 2) のコンテンツ ─────────
  const previewSection = (
    <>
      <section style={{
        ...panelStyle,
        background: 'rgba(251, 191, 36, 0.06)',
        border: '1px solid rgba(251, 191, 36, 0.35)',
      }}>
        <div style={{ ...labelStyle, color: '#fbbf24' }}>
          🎬 Phase 2 · Studio Deploy で共有
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', margin: '0 0 8px', lineHeight: 1.7 }}>
          このモードでは <strong>git push</strong> 後の Studio Deploy (Vercel) を確認します。
          クライアントレビューやチーム内デモに使う共有 URL の状態をチェックしてください。
        </p>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
          <li>DB は Supabase <code>studio</code> スキーマ (Studio 利用者全員で共有)</li>
          <li>認証は Cookie のモックユーザー (共有プロファイル)</li>
          <li>変更を反映するには <strong>git push → Vercel デプロイ</strong> を待つ</li>
        </ul>
      </section>

      <PublishedBadge appId={c.id} />
      <DeployInfoPanel appId={c.id} />
    </>
  )

  // ───────── リリースモード (Phase 3) のコンテンツ ─────────
  const releaseSection = (
    <>
      <section style={{
        ...panelStyle,
        background: 'rgba(52, 211, 153, 0.06)',
        border: '1px solid rgba(52, 211, 153, 0.35)',
      }}>
        <div style={{ ...labelStyle, color: '#34d399' }}>
          🚀 Phase 3 · AppHarbor 本番に昇格
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', margin: '0 0 8px', lineHeight: 1.7 }}>
          このモードでは <strong>AppHarbor 本番</strong> へのリリース準備状況を確認します。
          以下のチェックを通過したら <code>cartridges-registry.yaml</code> に version を追記して PR を出してください。
        </p>
        <ol style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12, color: '#94a3b8', lineHeight: 1.9 }}>
          <li>規約チェック (Lint) を通す</li>
          <li>カートリッジをエクスポートする</li>
          <li>AppHarbor 本体リポジトリの <code>cartridges-registry.yaml</code> を更新</li>
          <li>本体側で <code>cartridge:fetch</code> → migration 生成 → push</li>
        </ol>
      </section>

      <LintPanel appId={c.id} />

      <ExportButton appId={c.id} />

      {c.manifest && (
        <section style={panelStyle}>
          <details style={{ fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none', color: '#94a3b8' }}>
              manifest.json を表示
            </summary>
            <pre style={{
              marginTop: 10, fontSize: 12, color: '#e2e8f0',
              background: '#0f172a', border: '1px solid #334155',
              borderRadius: 6, padding: 12, overflow: 'auto',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            }}>
              {JSON.stringify(c.manifest, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </>
  )

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 64px' }}>
      <Link href="/" style={{ fontSize: 13, color: '#fbbf24', textDecoration: 'none' }}>← カートリッジ一覧へ戻る</Link>

      <header style={{ marginTop: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>
          {c.manifest?.displayName ?? c.id}
          <span style={{ color: '#64748b', fontSize: 14, marginLeft: 12, fontWeight: 400 }}>{c.id}</span>
        </h1>
        {c.manifest?.description && (
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 6 }}>{c.manifest.description}</p>
        )}
      </header>

      <ReleasePipeline appId={c.id} />

      <section style={panelStyle}>
        <div style={labelStyle}>パス</div>
        <code style={{ fontSize: 12, color: '#fbbf24', wordBreak: 'break-all' }}>{c.path}</code>
      </section>

      <section style={panelStyle}>
        <div style={labelStyle}>構成</div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
          <li>routes/: {c.hasRoutes ? '✅ あり' : '❌ なし'}</li>
          <li>db/: {c.hasDb ? '✅ あり' : '❌ なし'}</li>
          <li>manifest.json: {c.manifest ? '✅ あり' : c.error ? `❌ エラー: ${c.error}` : '❌ なし'}</li>
        </ul>
      </section>

      {/* DB 接続必要バナー: schema.sql に create table がある場合 */}
      {needsDb && (
        <section style={{
          ...panelStyle,
          background: '#1c2c20',
          border: '1px solid #10b981',
        }}>
          <div style={{ ...labelStyle, color: '#10b981' }}>
            🗄 このアプリは DB 接続が必要です
          </div>
          <p style={{ fontSize: 13, color: '#cbd5e1', margin: '0 0 8px', lineHeight: 1.7 }}>
            <code style={{ color: '#fbbf24' }}>db/schema.sql</code> に
            <strong> {schemaTables.length} 個</strong>のテーブル定義があります。
            <strong>本番デプロイ後、AppHarbor の「DB セットアップ」ダイアログから Supabase に SQL を適用してください。</strong>
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
            {schemaTables.map((t) => {
              const declared = manifestTables.includes(t)
              return (
                <li key={t}>
                  <code style={{ color: '#fbbf24' }}>{t}</code>
                  {declared
                    ? <span style={{ color: '#10b981', marginLeft: 8 }}>✓ manifest 宣言済み</span>
                    : <span style={{ color: '#f59e0b', marginLeft: 8 }}>⚠ manifest.tables に未宣言</span>
                  }
                </li>
              )
            })}
          </ul>
          {tablesOutOfSync && (
            <div style={{
              marginTop: 12, padding: 10,
              background: '#3f2a0e', border: '1px solid #f59e0b',
              borderRadius: 6, fontSize: 12, color: '#fbbf24',
            }}>
              <strong>⚠ manifest.json の <code>tables</code> 配列を schema.sql と一致させてください。</strong><br/>
              推奨値:
              <code style={{ display: 'block', marginTop: 6, padding: 8, background: '#0f172a', borderRadius: 4, color: '#e2e8f0' }}>
                "tables": {JSON.stringify(schemaTables)}
              </code>
            </div>
          )}
        </section>
      )}

      <CartridgeWorkbench
        appId={c.id}
        developSection={developSection}
        previewSection={previewSection}
        releaseSection={releaseSection}
      />
    </main>
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
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ minWidth: 96, color: '#94a3b8' }}>{label}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  )
}
