import Link from 'next/link'
import { ReleaseCheckClient } from './ReleaseCheckClient'

/**
 * Stage 5 リリース準備チェック専用ページ。
 *
 * カートリッジ詳細ページ (PipelineSection) は 5 ステージ全体を可視化するが、
 * このページは **本番リリース直前の最終確認** に特化したミニマル UI。
 *
 * URL: /cartridge/<appId>/release-check
 *
 * 表示項目 (すべて /api/cartridges/[appId]/stage5-prepare の結果を再利用):
 *   - manifest / schema / routes 等の構造チェック
 *   - GitHub リポジトリ / Git 同期状態
 *   - カートリッジ lint (@appharbor/sdk 等の禁止 import 検出)
 *   - 生成物: registry entry / production migration SQL
 */
export default async function ReleaseCheckPage({
  params,
}: {
  params: Promise<{ appId: string }>
}) {
  const { appId } = await params
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <header>
        <Link
          href={`/cartridge/${encodeURIComponent(appId)}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← カートリッジ詳細に戻る
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          🚀 Stage 5 リリース準備チェック
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <code>{appId}</code> を AppHarbor 本番 (appharbor.vercel.app) へ届ける前の
          自己診断ページ。全項目が緑になっていれば、release-checklist.md の 8 ステップを
          自動的に満たしている状態です。
        </p>
      </header>

      <ReleaseCheckClient appId={appId} />
    </div>
  )
}
