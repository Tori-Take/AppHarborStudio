/**
 * SchemaDiff から ALTER TABLE SQL を生成する (Plan B)。
 *
 * 生成方針:
 *   - 新規テーブル → CREATE TABLE 文をそのまま吐く
 *   - 削除テーブル → DROP TABLE (破壊的なので警告コメント付き)
 *   - 新規カラム  → ALTER TABLE ... ADD COLUMN
 *   - 削除カラム  → ALTER TABLE ... DROP COLUMN (破壊的なので警告コメント付き)
 *   - 変更カラム  → 単純な ALTER は生成せず、コメントで「人間が修正してください」
 *
 * 変更カラムを自動生成しない理由:
 *   - 型変換は失敗しやすい (TEXT → INT で非数値があるとアウト)
 *   - column rename を「削除 + 追加」と誤判定するとデータが消える
 *   - 「動かないなら直す」ループ前提なので、不確実な ALTER は人間任せにする
 */
import type { DestructiveWarning, ParsedTable, SchemaDiff } from './types'

export type AlterGenerationResult = {
  /** 生成された SQL (ヘッダコメント + ALTER 文すべて) */
  sql: string
  /** 破壊的変更の警告 (UI 表示用) */
  warnings: DestructiveWarning[]
  /** 手動対応が必要なカラム変更 (UI 表示用) */
  manualChangesNeeded: Array<{ table: string; column: string; reason: string }>
}

export type AlterGenerationOptions = {
  /** カートリッジ ID (コメント用) */
  cartridgeId: string
  /** 次のバージョン番号 (例: "v2") */
  nextVersion: string
  /** タイムスタンプ (任意。省略時は new Date()) */
  timestamp?: Date
  /** 破壊的変更の警告 */
  warnings: DestructiveWarning[]
}

/**
 * ALTER 系 SQL を生成する。
 *
 * 注意: 「変更カラム」は SQL を生成せず、SQL コメント + manualChangesNeeded で
 *       人間に判断を仰ぐ。
 */
export function generateAlterSql(
  diff: SchemaDiff,
  options: AlterGenerationOptions,
): AlterGenerationResult {
  const ts = options.timestamp ?? new Date()
  const isoDate = ts.toISOString()
  const manualChangesNeeded: AlterGenerationResult['manualChangesNeeded'] = []

  const parts: string[] = []
  parts.push(`-- =============================================================`)
  parts.push(`-- Migration: cart_${options.cartridgeId.replace(/-/g, '_')}_${options.nextVersion}`)
  parts.push(`-- Generated: ${isoDate}`)
  parts.push(`-- Mode:      UPDATE (incremental ALTER from schema.released.sql)`)
  parts.push(`-- =============================================================`)
  parts.push('')

  // 警告サマリ
  if (options.warnings.length > 0) {
    parts.push(`-- ⚠️ 破壊的変更を検出しました (${options.warnings.length} 件):`)
    for (const w of options.warnings) {
      parts.push(`--   [${w.severity.toUpperCase()}] ${w.message}`)
    }
    parts.push(`-- → 適用前に必ず PR でレビューしてください`)
    parts.push('')
  }

  // 1. 新規テーブル (CREATE TABLE)
  if (diff.newTables.length > 0) {
    parts.push(`-- --- 新規テーブル (${diff.newTables.length}) ---`)
    for (const t of diff.newTables) {
      parts.push(stripStudioSchema(t.raw))
      parts.push('')
    }
  }

  // 2. 新規カラム (ADD COLUMN)
  if (diff.newColumns.length > 0) {
    parts.push(`-- --- 新規カラム (${diff.newColumns.length}) ---`)
    for (const { table, column } of diff.newColumns) {
      const columnDef = stripStudioSchema(column.raw)
      parts.push(`alter table ${table} add column ${columnDef};`)
    }
    parts.push('')
  }

  // 3. 変更カラム (手動対応コメントのみ)
  if (diff.changedColumns.length > 0) {
    parts.push(`-- --- 変更カラム (${diff.changedColumns.length}) — 手動対応が必要 ---`)
    for (const c of diff.changedColumns) {
      const reason = describeColumnChange(c.before, c.after)
      manualChangesNeeded.push({ table: c.table, column: c.column, reason })
      parts.push(`-- TODO: ${c.table}.${c.column} を手動で修正してください`)
      parts.push(`--   before: ${c.before.raw.trim()}`)
      parts.push(`--   after:  ${c.after.raw.trim()}`)
      parts.push(`--   reason: ${reason}`)
      parts.push(`--   例: alter table ${c.table} alter column ${c.column} type ${c.after.type};`)
      parts.push('')
    }
  }

  // 4. 削除カラム (DROP COLUMN, 破壊的)
  if (diff.droppedColumns.length > 0) {
    parts.push(`-- --- 削除カラム (${diff.droppedColumns.length}) — ⚠️ 破壊的 ---`)
    for (const { table, column } of diff.droppedColumns) {
      parts.push(`-- ⚠️ データ消失: ${table}.${column.name} のデータが失われます`)
      parts.push(`alter table ${table} drop column ${column.name};`)
    }
    parts.push('')
  }

  // 5. 削除テーブル (DROP TABLE, 破壊的)
  if (diff.droppedTables.length > 0) {
    parts.push(`-- --- 削除テーブル (${diff.droppedTables.length}) — ⚠️ 破壊的 ---`)
    for (const t of diff.droppedTables) {
      parts.push(`-- ⚠️ データ消失: テーブル ${t.name} の全データが失われます`)
      parts.push(`drop table ${t.name};`)
    }
    parts.push('')
  }

  // 6. 新規ポリシー (CREATE POLICY)
  if (diff.newPolicies.length > 0) {
    parts.push(`-- --- 新規ポリシー (${diff.newPolicies.length}) ---`)
    for (const p of diff.newPolicies) {
      parts.push(stripStudioSchema(p.raw))
      // 念のため終端 ; を保証
      if (!/;\s*$/.test(p.raw)) parts.push(';')
      parts.push('')
    }
  }

  // 7. 変更ポリシー (DROP IF EXISTS + CREATE)
  if (diff.changedPolicies.length > 0) {
    parts.push(`-- --- 変更ポリシー (${diff.changedPolicies.length}) — DROP + CREATE で置換 ---`)
    for (const c of diff.changedPolicies) {
      parts.push(`drop policy if exists ${c.name} on ${c.table};`)
      parts.push(stripStudioSchema(c.after.raw))
      if (!/;\s*$/.test(c.after.raw)) parts.push(';')
      parts.push('')
    }
  }

  // 8. 削除ポリシー (DROP POLICY IF EXISTS)
  if (diff.droppedPolicies.length > 0) {
    parts.push(`-- --- 削除ポリシー (${diff.droppedPolicies.length}) ---`)
    for (const p of diff.droppedPolicies) {
      parts.push(`drop policy if exists ${p.name} on ${p.table};`)
    }
    parts.push('')
  }

  // 何もなければプレースホルダ
  if (diff.isEmpty) {
    parts.push(`-- スキーマに変更はありません。`)
    parts.push(`-- このカートリッジは routes/ のコード変更のみで本番反映できます。`)
    parts.push(`-- → カートリッジリポに git push するだけで AppHarbor が自動取り込みします。`)
  }

  return {
    sql: parts.join('\n') + '\n',
    warnings: options.warnings,
    manualChangesNeeded,
  }
}

/**
 * カラム変更の理由を人間向け文字列にする。
 */
function describeColumnChange(
  before: { type: string; constraintsRaw: string },
  after: { type: string; constraintsRaw: string },
): string {
  const reasons: string[] = []
  if (before.type !== after.type) reasons.push(`型変更 (${before.type} → ${after.type})`)
  if (before.constraintsRaw !== after.constraintsRaw) reasons.push(`制約変更`)
  return reasons.join(' / ') || '不明'
}

/** studio スキーマ参照を public 用に書き換える (install-to-appharbor と同じ処理) */
function stripStudioSchema(sql: string): string {
  return sql
    .replace(/create\s+schema\s+if\s+not\s+exists\s+studio\s*;/gi, '')
    .replace(/set\s+search_path\s+to\s+studio\s*,?\s*public\s*;/gi, '')
    .replace(/studio\./g, '')
}

/**
 * 既存の migration ファイル名一覧から次の version 番号 (v2, v3, ...) を採番する。
 *
 * 入力例: ["20260518123000_cart_versus_space_invaders_v1.sql"]
 * 出力:   "v2"
 */
export function determineNextVersion(
  cartridgeId: string,
  existingMigrationFilenames: string[],
): string {
  const cartridgeIdSafe = cartridgeId.replace(/-/g, '_')
  const versionRe = new RegExp(`_cart_${cartridgeIdSafe}_v(\\d+)\\.sql$`, 'i')
  let maxVer = 0
  for (const name of existingMigrationFilenames) {
    const m = name.match(versionRe)
    if (m) {
      const v = Number.parseInt(m[1], 10)
      if (!Number.isNaN(v) && v > maxVer) maxVer = v
    }
  }
  return `v${maxVer + 1}`
}
