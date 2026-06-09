'use client'

import { Loader2, AlertCircle, RefreshCw, Copy, FileCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SchemaDiffSummary = {
  newTables: string[]
  droppedTables: string[]
  newColumns: Array<{ table: string; column: string; type: string }>
  droppedColumns: Array<{ table: string; column: string }>
  changedColumns: Array<{ table: string; column: string; beforeType: string; afterType: string }>
  newPolicies: Array<{ table: string; name: string; raw: string }>
  droppedPolicies: Array<{ table: string; name: string; raw: string }>
  changedPolicies: Array<{ table: string; name: string; beforeRaw: string; afterRaw: string }>
  isEmpty: boolean
}

type DestructiveWarning = {
  severity: 'high' | 'medium' | 'low'
  category: 'drop_table' | 'drop_column' | 'change_type' | 'add_not_null' | 'drop_policy'
  table: string
  column?: string
  policy?: string
  message: string
}

type Stage5PrepareResult = {
  mode: 'initial' | 'update'
  productionMigration: string
  registryEntry: string
  diff: SchemaDiffSummary | null
  warnings: DestructiveWarning[]
  manualChangesNeeded: Array<{ table: string; column: string; reason: string }>
  schemaReleasedSnapshot: string
}

type TypeCheckResult = {
  ok: boolean
  errors?: Array<{ file: string; line: number; col: number; code: string; message: string }>
  duration?: number
  error?: string
} | null

type Props = {
  stage5: Stage5PrepareResult
  typeCheckBusy: boolean
  typeCheckResult: TypeCheckResult
  onTypeCheck: () => void
  stage5Copied: 'migration' | 'registry' | 'snapshot' | null
  setStage5Copied: (v: 'migration' | 'registry' | 'snapshot' | null) => void
}

export function Stage5Details({
  stage5,
  typeCheckBusy,
  typeCheckResult,
  onTypeCheck,
  stage5Copied,
  setStage5Copied,
}: Props) {
  return (
    <>
      {/* Update mode: diff summary */}
      {stage5.mode === 'update' && stage5.diff && (
        <div className="rounded border bg-card p-3 space-y-2">
          <div className="text-xs font-semibold">📊 schema 差分サマリ</div>
          {stage5.diff.isEmpty ? (
            <p className="text-[11px] text-muted-foreground">
              差分なし。schema 変更がないので、カートリッジリポに git push するだけで本番反映されます。
              (PR 作成ボタンを押すと「差分なし」エラーになります)
            </p>
          ) : (
            <div className="text-[11px] space-y-1">
              {stage5.diff.newTables.length > 0 && (
                <div className="text-emerald-700">
                  ✅ 新規テーブル ({stage5.diff.newTables.length}): {stage5.diff.newTables.join(', ')}
                </div>
              )}
              {stage5.diff.newColumns.length > 0 && (
                <div className="text-emerald-700">
                  ✅ 新規カラム ({stage5.diff.newColumns.length}):{' '}
                  {stage5.diff.newColumns.map(c => `${c.table}.${c.column} (${c.type})`).join(', ')}
                </div>
              )}
              {stage5.diff.changedColumns.length > 0 && (
                <div className="text-amber-700">
                  ⚠️ 変更カラム ({stage5.diff.changedColumns.length}) — 手動対応推奨:{' '}
                  {stage5.diff.changedColumns
                    .map(c => `${c.table}.${c.column} (${c.beforeType} → ${c.afterType})`)
                    .join(', ')}
                </div>
              )}
              {stage5.diff.droppedColumns.length > 0 && (
                <div className="text-destructive">
                  ❌ 削除カラム ({stage5.diff.droppedColumns.length}):{' '}
                  {stage5.diff.droppedColumns.map(c => `${c.table}.${c.column}`).join(', ')}
                </div>
              )}
              {stage5.diff.droppedTables.length > 0 && (
                <div className="text-destructive">
                  ❌ 削除テーブル ({stage5.diff.droppedTables.length}):{' '}
                  {stage5.diff.droppedTables.join(', ')}
                </div>
              )}
              {stage5.diff.newPolicies.length > 0 && (
                <div className="text-emerald-700">
                  ✅ 新規ポリシー ({stage5.diff.newPolicies.length}):{' '}
                  {stage5.diff.newPolicies.map(p => `${p.table}.${p.name}`).join(', ')}
                </div>
              )}
              {stage5.diff.changedPolicies.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-blue-700">
                    🔄 変更ポリシー ({stage5.diff.changedPolicies.length})
                  </div>
                  <div className="ml-4 space-y-2">
                    {stage5.diff.changedPolicies.map((p, i) => (
                      <details key={i} className="text-[10px]">
                        <summary className="cursor-pointer text-blue-700 hover:text-blue-900 font-mono">
                          {p.table}.{p.name}
                        </summary>
                        <div className="mt-1 ml-2 space-y-1 font-mono">
                          <div className="rounded border border-muted-foreground/30 bg-muted/20 px-2 py-1">
                            <div className="text-muted-foreground text-[9px] mb-0.5">before:</div>
                            <pre className="whitespace-pre-wrap text-[10px]">{p.beforeRaw.trim()}</pre>
                          </div>
                          <div className="rounded border border-blue-500/30 bg-blue-500/5 px-2 py-1">
                            <div className="text-blue-700 text-[9px] mb-0.5">after:</div>
                            <pre className="whitespace-pre-wrap text-[10px]">{p.afterRaw.trim()}</pre>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
              {stage5.diff.droppedPolicies.length > 0 && (
                <div className="text-amber-700">
                  ⚠️ 削除ポリシー ({stage5.diff.droppedPolicies.length}):{' '}
                  {stage5.diff.droppedPolicies.map(p => `${p.table}.${p.name}`).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Update mode: warnings (severity 別表示) */}
      {stage5.mode === 'update' && stage5.warnings && stage5.warnings.length > 0 && (() => {
        const high   = stage5.warnings.filter(w => w.severity === 'high')
        const medium = stage5.warnings.filter(w => w.severity === 'medium')
        const low    = stage5.warnings.filter(w => w.severity === 'low')
        const hasHigh = high.length > 0

        // 全体の色味は最も重い severity に合わせる
        const box = hasHigh
          ? 'border-destructive/40 bg-destructive/5'
          : medium.length > 0
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-blue-500/30 bg-blue-500/5'
        const titleColor = hasHigh
          ? 'text-destructive'
          : medium.length > 0 ? 'text-amber-800' : 'text-blue-800'
        const titleText = hasHigh
          ? `🔴 破壊的変更を検出 (${high.length} 件)`
          : medium.length > 0
            ? `🟡 挙動が変わる変更を検出 (${medium.length} 件)`
            : `🔵 軽微な変更 (${low.length} 件)`

        return (
          <div className={cn('rounded border p-3 space-y-2', box)}>
            <div className={cn('text-xs font-semibold flex items-center gap-1.5', titleColor)}>
              <AlertCircle className="h-3.5 w-3.5" />
              {titleText}
            </div>

            {high.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[11px] font-semibold text-destructive">🔴 HIGH — データ消失の可能性</div>
                <ul className="text-[11px] text-destructive space-y-0.5 ml-4 list-disc">
                  {high.map((w, i) => <li key={i}>{w.message}</li>)}
                </ul>
              </div>
            )}

            {medium.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[11px] font-semibold text-amber-800">🟡 MEDIUM — 挙動が変わる変更</div>
                <ul className="text-[11px] text-amber-800 space-y-0.5 ml-4 list-disc">
                  {medium.map((w, i) => <li key={i}>{w.message}</li>)}
                </ul>
              </div>
            )}

            {low.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[11px] font-semibold text-blue-800">🔵 LOW — 影響の小さい変更</div>
                <ul className="text-[11px] text-blue-800 space-y-0.5 ml-4 list-disc">
                  {low.map((w, i) => <li key={i}>{w.message}</li>)}
                </ul>
              </div>
            )}

            <p className="text-[11px] mt-1">
              {hasHigh ? (
                <span className="text-destructive/80">
                  本番にデータが入っている場合、データ消失や ALTER 失敗の可能性があります。PR を必ず人間がレビューしてください。
                </span>
              ) : medium.length > 0 ? (
                <span className="text-amber-700">
                  挙動が変わる変更です。意図したものか PR で確認してください (意図的なら OK)。
                </span>
              ) : (
                <span className="text-blue-700">
                  軽微な変更です。PR レビューで内容を確認してください。
                </span>
              )}
            </p>
          </div>
        )
      })()}

      {/* Update mode: manual changes needed */}
      {stage5.mode === 'update' && stage5.manualChangesNeeded && stage5.manualChangesNeeded.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-1.5">
          <div className="text-xs font-semibold text-amber-800">
            🛠️ 手動対応が必要なカラム変更 ({stage5.manualChangesNeeded.length} 件)
          </div>
          <p className="text-[11px] text-amber-700">
            自動生成された migration SQL に TODO コメントが入っています。マージ前に SQL を編集してください。
          </p>
          <ul className="text-[11px] text-amber-700 space-y-0.5 ml-4 list-disc">
            {stage5.manualChangesNeeded.map((m, i) => (
              <li key={i}>
                <code className="bg-amber-500/10 px-1 rounded">{m.table}.{m.column}</code>: {m.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Generated artifacts */}
      <div className="space-y-2">
        {/* Production migration */}
        {stage5.productionMigration && (
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5" />
              {stage5.mode === 'update' ? 'ALTER migration SQL (生成済み)' : '本番用 migration SQL (CREATE TABLE)'}
            </summary>
            <pre className="mt-1.5 rounded border bg-muted/30 px-2 py-1.5 font-mono whitespace-pre overflow-x-auto max-h-60 overflow-y-auto text-[10px]">
              {stage5.productionMigration}
            </pre>
          </details>
        )}

        {/* schema.released.sql snapshot */}
        {stage5.schemaReleasedSnapshot && (
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5" />
              db/schema.released.sql (PR マージ後にカートリッジリポへコミット)
            </summary>
            <div className="mt-1.5 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                PR マージ・本番適用後、このファイルをカートリッジリポの <code className="bg-muted px-1 rounded">db/schema.released.sql</code> としてコミットしてください。次回の改修時の diff 基準になります。
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(stage5.schemaReleasedSnapshot)
                  setStage5Copied('snapshot')
                  setTimeout(() => setStage5Copied(null), 2000)
                }}
                className="gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                {stage5Copied === 'snapshot' ? 'コピー済み' : 'schema.released.sql をコピー'}
              </Button>
              <pre className="rounded border bg-muted/30 px-2 py-1.5 font-mono whitespace-pre overflow-x-auto max-h-60 overflow-y-auto text-[10px]">
                {stage5.schemaReleasedSnapshot}
              </pre>
            </div>
          </details>
        )}
      </div>

      {/* 事前チェック: ローカル型チェック */}
      <div className="rounded border bg-card p-3 space-y-2">
        <div className="text-xs font-semibold flex items-center justify-between">
          <span>🔍 PR 作成前にローカル型チェック (推奨)</span>
          {typeCheckResult?.ok && (
            <span className="text-emerald-600 text-[11px]">✓ エラー無し ({typeCheckResult.duration}ms)</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          AppHarbor 本番ビルドと同じ TypeScript チェックをローカルで実行。
          ここで通れば PR 作成後の Vercel ビルドも通る確率が高い。
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onTypeCheck}
          disabled={typeCheckBusy}
          className="gap-1.5"
        >
          {typeCheckBusy
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
          {typeCheckBusy ? '型チェック中... (10-30 秒)' : '型チェックを実行'}
        </Button>
        {typeCheckResult && !typeCheckResult.ok && (
          <div className="rounded border border-destructive/40 bg-destructive/5 p-2 space-y-1">
            <div className="text-[11px] font-semibold text-destructive">
              ❌ {typeCheckResult.errors?.length ?? 0} 件の型エラー
              {typeCheckResult.error && ` — ${typeCheckResult.error}`}
            </div>
            {typeCheckResult.errors && typeCheckResult.errors.length > 0 && (
              <ul className="text-[10px] font-mono space-y-0.5 max-h-48 overflow-y-auto">
                {typeCheckResult.errors.slice(0, 20).map((e, i) => (
                  <li key={i} className="text-destructive">
                    <span className="text-muted-foreground">{e.file.replace(/^.*cartridges\//, 'cartridges/')}:{e.line}:{e.col}</span>{' '}
                    <span className="font-semibold">{e.code}</span>: {e.message}
                  </li>
                ))}
                {typeCheckResult.errors.length > 20 && (
                  <li className="text-muted-foreground">... 残り {typeCheckResult.errors.length - 20} 件</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 補助: 手動でコピーしたい場合 */}
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">
          手動で進めたい場合 (生成物のコピー)
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(stage5.productionMigration)
              setStage5Copied('migration')
              setTimeout(() => setStage5Copied(null), 2000)
            }}
            disabled={!stage5.productionMigration}
            className="gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            {stage5Copied === 'migration' ? 'コピー済み' : 'Migration をコピー'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(stage5.registryEntry)
              setStage5Copied('registry')
              setTimeout(() => setStage5Copied(null), 2000)
            }}
            className="gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            {stage5Copied === 'registry' ? 'コピー済み' : 'Registry をコピー'}
          </Button>
        </div>
      </details>
    </>
  )
}
