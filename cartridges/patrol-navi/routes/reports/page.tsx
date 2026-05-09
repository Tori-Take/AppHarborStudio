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
              4 シート構成の xlsx ファイルとしてダウンロード:
              <ul className="mt-2 ml-4 list-disc space-y-0.5">
                <li><code className="text-xs">Sheets</code> — パトロール一覧（実施日 / 現場 / ステータス / 所感）</li>
                <li><code className="text-xs">Items</code> — 全項目の結果（行 = シート × 項目）</li>
                <li><code className="text-xs">NG</code> — NG 項目だけ抽出</li>
                <li><code className="text-xs">Workflow</code> — ワークフロー履歴（誰がいつ承認したか）</li>
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
              <br />
              （月次レポート PDF / 監査用 ZIP は v2.7+ で対応予定）
            </p>
          </CardContent>
        </Card>
      </div>
    </PatrolLayout>
  )
}
