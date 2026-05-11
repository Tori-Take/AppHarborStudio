import { requireApp, getAdminSupabase } from '@/sdk'
import { PatrolLayout } from '../patrol-layout'
import { Card, CardContent, CardHeader, CardTitle } from '../_ui/card'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { isPatrolAdmin, canViewPatrols } from '../_helpers/patrolRole'
import { ReportFilters } from './ReportFilters'

export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { slug } = await params
  const sp       = await searchParams
  const ctx      = await requireApp(slug, 'patrol-navi', canViewPatrols)
  const orgId    = ctx.actor.organizationId

  // デフォルト期間: 直近 90 日
  const defaultTo   = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 90)
  const fromStr = sp.from ?? defaultFrom.toISOString().slice(0, 10)
  const toStr   = sp.to   ?? defaultTo.toISOString().slice(0, 10)

  // 件数プレビュー
  const supabase = getAdminSupabase()
  const { count: sheetCount } = await supabase
    .from('patrol_check_sheets')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .gte('patrol_date', fromStr)
    .lte('patrol_date', toStr)

  const base = `/org/${slug}/apps/patrol-navi`
  const xlsxUrl = `${base}/api/export/sheets?from=${fromStr}&to=${toStr}`
  const pdfUrl  = `${base}/reports/period-pdf?from=${fromStr}&to=${toStr}`
  const pdfAutoUrl = `${pdfUrl}&auto=1`

  return (
    <PatrolLayout isAdmin={isPatrolAdmin(ctx.role)}>
      <div className="max-w-3xl space-y-6 p-4 sm:p-8">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Download className="h-6 w-6" />
            集計出力
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            期間を指定してパトロール記録を Excel / PDF で出力します
          </p>
        </div>

        {/* 期間フィルタ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">期間</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportFilters defaultFrom={fromStr} defaultTo={toStr} />
            <p className="mt-3 text-sm text-muted-foreground">
              対象: <span className="font-medium text-foreground">{sheetCount ?? 0}</span> 件のパトロール記録
            </p>
          </CardContent>
        </Card>

        {/* Excel 出力 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Excel エクスポート
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              6 シート構成の xlsx ファイルとしてダウンロード:
              <ul className="mt-2 ml-4 list-disc space-y-0.5">
                <li><code className="text-xs">Sheets</code> — パトロール一覧（集計・完了率・写真枚数付き）</li>
                <li><code className="text-xs">Items</code> — 全項目の結果（写真枚数・根拠法令含む）</li>
                <li><code className="text-xs">NG</code> — NG 項目 + 是正アクション結合</li>
                <li><code className="text-xs">是正</code> — 是正アクション一覧（担当・期限・完了状況）</li>
                <li><code className="text-xs">Workflow</code> — ワークフロー履歴（誰がいつ承認したか）</li>
                <li><code className="text-xs">コメント</code> — スレッドコメント一覧</li>
              </ul>
            </div>
            <a
              href={xlsxUrl}
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2"
            >
              <Download className="h-4 w-4" />
              Excel をダウンロード
            </a>
          </CardContent>
        </Card>

        {/* 期間レポート PDF（A3 横 2 面） */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              期間レポート PDF（A3 横・両面）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              指定期間の集計をダッシュボード形式で A3 横 2 面（両面印刷）にまとめます:
              <ul className="mt-2 ml-4 list-disc space-y-0.5">
                <li><strong>表面</strong>: KPI（総数・完了率・NG・是正状況）+ パトロール一覧 + カテゴリ/現場/項目別 NG ランキング</li>
                <li><strong>裏面</strong>: 担当者別 是正集計 + 是正アクション一覧（期限超過警告） + NG 項目詳細</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={pdfAutoUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2"
              >
                <Download className="h-4 w-4" />
                PDF を作成（印刷ダイアログを自動表示）
              </a>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background hover:bg-muted text-sm font-medium px-4 py-2"
              >
                <FileText className="h-4 w-4" />
                プレビュー
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              ※ ブラウザの印刷ダイアログで「用紙サイズ: A3」「向き: 横」「両面印刷」を選択して印刷してください。
            </p>
          </CardContent>
        </Card>

        {/* PDF（個別シート） */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              個別シート PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              各シートの詳細画面右上「印刷 / PDF」ボタン →
              ブラウザの印刷ダイアログから「PDF として保存」で出力できます。
            </p>
          </CardContent>
        </Card>
      </div>
    </PatrolLayout>
  )
}
