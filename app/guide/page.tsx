import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function GuidePage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> ホームに戻る
      </Link>

      <h1 className="text-2xl font-bold mb-2">AppHarbor Studio ガイド</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Studio の設計思想と操作方法
      </p>

      {/* Design Philosophy */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4 border-b pb-2">設計思想</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold mb-2">Studio は「動作確認のハブ」</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              コーディングは Claude Code・Cursor・VS Code など外部の AI ツールで行います。
              Studio はコードを書く場所ではなく、書いたコードを
              <strong className="text-foreground"> 素早くテストする場所</strong>です。
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-2">Studio はローカル専用ツール</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Studio は開発者の PC で動作するローカル専用ツールです。
              フォルダ操作・本番モード起動・DB リセットなど、すべての機能がローカル環境で完結します。
            </p>
            <div className="rounded-lg border bg-muted/20 p-4 font-mono text-sm">
              <div className="text-muted-foreground text-xs mb-2"># セットアップ（GitHub からダウンロード）</div>
              <div>git clone https://github.com/Tori-Take/AppHarborStudio.git</div>
              <div>cd AppHarborStudio</div>
              <div>npm install</div>
              <div>npm run dev</div>
              <div className="text-muted-foreground text-xs mt-1"># → http://localhost:3200 で起動</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-2">2 つのモード</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Studio はローカルで 2 つのモードでカートリッジを動作確認できます。
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="font-bold mb-1">開発モード（port 3200）</div>
                <div className="text-xs text-muted-foreground">
                  ホットリロード有効。コード変更が即座に反映。詳細なエラー表示。日常の開発作業用。
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="font-bold mb-1">本番モード（port 3100）</div>
                <div className="text-xs text-muted-foreground">
                  ビルド済みの最適化版。本番環境に近い挙動で動作確認。リリース前の最終チェック用。
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-2">カートリッジの設計原則</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              カートリッジ作者の責務は 3 つだけ:
            </p>
            <ol className="list-decimal ml-5 text-sm text-muted-foreground space-y-1">
              <li><code className="text-xs bg-muted rounded px-1">db/schema.sql</code> — テーブル定義（全テーブルに organization_id）</li>
              <li><code className="text-xs bg-muted rounded px-1">manifest.json</code> — メタ情報（ID・名前・権限・ナビゲーション）</li>
              <li><code className="text-xs bg-muted rounded px-1">routes/*</code> — ページ群（organization_id でフィルタするコード）</li>
            </ol>
          </div>
        </div>
      </section>

      {/* How to Use */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4 border-b pb-2">操作方法</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold mb-3">初回セットアップ（1回のみ）</h3>
            <div className="space-y-3">
              <Step n={1} title="Studio で新規カートリッジを作成">
                ホーム画面の「新規作成」からカートリッジ名とフォルダ場所を指定。
                manifest.json・routes/・db/ が自動生成されます。
              </Step>
              <Step n={2} title="AI 開発コンテキストをコピー">
                カートリッジ詳細ページで「AI コンテキストをコピー」ボタンを押す。
                SDK の型定義・使い方・設計ルールがクリップボードにコピーされます。
              </Step>
              <Step n={3} title="フォルダを開いて AI 開発を開始">
                「フォルダを開く」でエクスプローラーを起動。
                Claude Code なら <code className="text-xs bg-muted rounded px-1">cd &quot;パス&quot; &amp;&amp; claude</code> で即開始。
                コピーした AI コンテキストを貼り付けて指示すると、SDK に沿ったコードを書いてくれます。
              </Step>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-3">日常の開発サイクル（繰り返し）</h3>
            <div className="rounded-lg border bg-muted/20 p-4 text-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="rounded-full bg-background border px-3 py-1">外部ツールでコード編集</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 font-medium">Studio で起動して確認</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-full bg-background border px-3 py-1">問題があれば修正</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-muted-foreground">繰り返し</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              「Studio で起動」ボタンが日常で最も使う機能です。
              モード（開発/本番）を選んで起動します。
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-3">起動後の機能</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex gap-2">
                <span className="font-bold text-foreground shrink-0">ユーザー切替</span>
                <span>30 人のモックユーザーを自由に切替。ロール（管理者・閲覧者等）の割当も可能。権限による画面の出し分けをリアルタイムでテスト。</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-foreground shrink-0">DB インスペクタ</span>
                <span>PGlite のテーブル内容を直接閲覧・SQL 実行。データの中身を確認しながらデバッグ。</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-foreground shrink-0">クエリログ</span>
                <span>実行された SQL クエリの履歴を表示。パフォーマンス確認やバグ追跡に。</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Feature List */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4 border-b pb-2">機能一覧</h2>

        <div className="space-y-4">
          <FeatureGroup title="幹 — 起動" items={[
            { name: 'Studio で起動', desc: 'カートリッジをモック環境で起動。開発モード（ホットリロード）と本番モード（ビルド済み）を選択。' },
            { name: '規約チェック警告', desc: 'import 違反を自動検出。起動は止めないが、本番で壊れる可能性を通知。' },
            { name: 'AI に修正を依頼', desc: '規約違反の内容を AI 修正用プロンプトとしてワンクリックコピー。' },
          ]} />

          <FeatureGroup title="枝 — データベース操作" items={[
            { name: 'データリセット', desc: 'PGlite のデータを初期状態に戻す。開発中に壊れたデータのクリーンアップ。' },
            { name: '完全リセット', desc: 'マウント + DB を完全再構築。深刻な不整合の復旧に。' },
            { name: 'データ移行', desc: 'PGlite ↔ Supabase (studio/public) 間のデータ移行。（準備中）' },
          ]} />

          <FeatureGroup title="枝葉 — ダッシュボード" items={[
            { name: '環境ステータス', desc: 'ローカル・デプロイ・本番の同期状況を SHA 比較で一目で確認。' },
            { name: '外部サービス', desc: 'GitHub・Supabase・Vercel・AppHarbor 本番へのショートカットリンク。' },
            { name: 'AI コンテキスト', desc: 'SDK 型定義 + manifest + CLAUDE.md をまとめてコピー。AI ツールに渡して即開発開始。' },
            { name: '配布パッケージ', desc: '.appcart.json としてエクスポート。AppHarbor 本体にインストール可能な形式。' },
            { name: 'フォルダを開く', desc: 'カートリッジフォルダを OS のエクスプローラーで開く。' },
            { name: 'manifest.json', desc: 'カートリッジの設定を確認。テーブル宣言と schema.sql の不一致も検出。' },
          ]} />
        </div>
      </section>

      {/* Data Architecture */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4 border-b pb-2">データアーキテクチャ</h2>

        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          カートリッジのコードは同じ SDK で 3 つの環境に対応します。
          Studio ではローカル環境（PGlite）でテストし、
          デプロイ・本番ではそれぞれの Supabase スキーマにデータが保存されます。
        </p>

        <div className="rounded-lg border bg-muted/20 p-4 font-mono text-xs space-y-2">
          <div>カートリッジコード: <span className="text-muted-foreground">import &#123; getAdminSupabase &#125; from &apos;@/sdk&apos;</span></div>
          <div className="text-muted-foreground ml-4">↓ 同じ API で 3 環境に対応</div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="rounded border p-2 text-center border-foreground/30 bg-background">
              <div className="font-bold">ローカル (Studio)</div>
              <div className="text-muted-foreground">PGlite</div>
              <div className="text-muted-foreground">.studio-db/pgdata</div>
            </div>
            <div className="rounded border p-2 text-center">
              <div className="font-bold">デプロイ</div>
              <div className="text-muted-foreground">Supabase</div>
              <div className="text-muted-foreground">studio スキーマ</div>
            </div>
            <div className="rounded border p-2 text-center">
              <div className="font-bold">本番</div>
              <div className="text-muted-foreground">Supabase</div>
              <div className="text-muted-foreground">public スキーマ</div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          カートリッジは organization_id を持つテーブルを作るだけ。データがどこに保存されるかは SDK と環境が決めます。
          Studio はローカル環境での開発・テストに特化しています。
        </p>
      </section>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white mt-0.5">
        {n}
      </span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

function FeatureGroup({ title, items }: { title: string; items: { name: string; desc: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-bold mb-2">{title}</h3>
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.name} className="flex gap-3 text-sm py-1.5">
            <span className="font-medium shrink-0 w-36">{item.name}</span>
            <span className="text-muted-foreground">{item.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
