/**
 * スキーマ差分計算 (Plan B)。
 *
 * 入力: parser.ts でパースした 2 つの ParsedSchema
 *   - released: 前回 Stage 5 で本番に出した状態
 *   - current:  今ローカルで作業中の状態
 *
 * 出力: SchemaDiff (新規/削除/変更されたテーブル・カラム)
 */
import type {
  ColumnChange,
  DestructiveWarning,
  ParsedColumn,
  ParsedPolicy,
  ParsedSchema,
  PolicyChange,
  SchemaDiff,
} from './types'

/**
 * 2 つのスキーマを比較し、差分を計算する。
 *
 * @param released 前回 Stage 5 でリリースしたスキーマ (基準)
 * @param current  現在のスキーマ
 */
export function diffSchemas(released: ParsedSchema, current: ParsedSchema): SchemaDiff {
  const releasedNames = new Set(released.tables.keys())
  const currentNames = new Set(current.tables.keys())

  // 新規テーブル: current にあるが released にない
  const newTables = [...current.tables.values()].filter(t => !releasedNames.has(t.name))
  // 削除テーブル: released にあるが current にない
  const droppedTables = [...released.tables.values()].filter(t => !currentNames.has(t.name))

  const newColumns: SchemaDiff['newColumns'] = []
  const droppedColumns: SchemaDiff['droppedColumns'] = []
  const changedColumns: ColumnChange[] = []

  // 両方にあるテーブルでカラム差分を計算
  for (const name of currentNames) {
    if (!releasedNames.has(name)) continue
    const beforeTable = released.tables.get(name)!
    const afterTable = current.tables.get(name)!
    const beforeCols = new Map(beforeTable.columns.map(c => [c.name, c]))
    const afterCols = new Map(afterTable.columns.map(c => [c.name, c]))

    // 新規カラム
    for (const [colName, col] of afterCols) {
      if (!beforeCols.has(colName)) {
        newColumns.push({ table: name, column: col })
      }
    }
    // 削除カラム
    for (const [colName, col] of beforeCols) {
      if (!afterCols.has(colName)) {
        droppedColumns.push({ table: name, column: col })
      }
    }
    // 変更カラム (型 or 制約)
    for (const [colName, before] of beforeCols) {
      const after = afterCols.get(colName)
      if (!after) continue
      if (columnsEqual(before, after)) continue
      changedColumns.push({ table: name, column: colName, before, after })
    }
  }

  // --- ポリシー差分 ---
  const releasedPolicyKeys = new Set(released.policies.keys())
  const currentPolicyKeys = new Set(current.policies.keys())

  const newPolicies: ParsedPolicy[] = []
  const droppedPolicies: ParsedPolicy[] = []
  const changedPolicies: PolicyChange[] = []

  for (const key of currentPolicyKeys) {
    if (!releasedPolicyKeys.has(key)) {
      newPolicies.push(current.policies.get(key)!)
    }
  }
  for (const key of releasedPolicyKeys) {
    if (!currentPolicyKeys.has(key)) {
      droppedPolicies.push(released.policies.get(key)!)
    }
  }
  for (const key of releasedPolicyKeys) {
    if (!currentPolicyKeys.has(key)) continue
    const before = released.policies.get(key)!
    const after = current.policies.get(key)!
    if (before.normalized === after.normalized) continue
    changedPolicies.push({ table: before.table, name: before.name, before, after })
  }

  const isEmpty =
    newTables.length === 0 &&
    droppedTables.length === 0 &&
    newColumns.length === 0 &&
    droppedColumns.length === 0 &&
    changedColumns.length === 0 &&
    newPolicies.length === 0 &&
    droppedPolicies.length === 0 &&
    changedPolicies.length === 0

  return {
    newTables,
    droppedTables,
    newColumns,
    droppedColumns,
    changedColumns,
    newPolicies,
    droppedPolicies,
    changedPolicies,
    isEmpty,
  }
}

/** カラムが等価かどうか (type と constraintsRaw を比較) */
function columnsEqual(a: ParsedColumn, b: ParsedColumn): boolean {
  return a.type === b.type && a.constraintsRaw === b.constraintsRaw
}

/**
 * 差分から破壊的変更の警告を抽出する。
 *
 * 破壊的変更:
 *   - drop_table:   テーブル削除 (データ消失)
 *   - drop_column:  カラム削除 (データ消失)
 *   - change_type:  型変更 (キャスト失敗の可能性)
 *   - add_not_null: NOT NULL 追加 (既存データに NULL があると失敗)
 */
export function findDestructiveWarnings(diff: SchemaDiff): DestructiveWarning[] {
  const warnings: DestructiveWarning[] = []

  for (const t of diff.droppedTables) {
    warnings.push({
      severity: 'high',
      category: 'drop_table',
      table: t.name,
      message: `テーブル "${t.name}" が削除されます。テーブル内の全データが消失します。`,
    })
  }

  for (const c of diff.droppedColumns) {
    warnings.push({
      severity: 'high',
      category: 'drop_column',
      table: c.table,
      column: c.column.name,
      message: `カラム "${c.table}.${c.column.name}" が削除されます。このカラムのデータが消失します。`,
    })
  }

  for (const c of diff.changedColumns) {
    // 型変更
    if (c.before.type !== c.after.type) {
      warnings.push({
        severity: 'medium',
        category: 'change_type',
        table: c.table,
        column: c.column,
        message: `カラム "${c.table}.${c.column}" の型が ${c.before.type} → ${c.after.type} に変更されます。既存データのキャストが失敗する可能性があります。`,
      })
    }
    // NOT NULL 追加
    const beforeNotNull = /\bnot\s+null\b/.test(c.before.constraintsRaw)
    const afterNotNull = /\bnot\s+null\b/.test(c.after.constraintsRaw)
    if (!beforeNotNull && afterNotNull) {
      warnings.push({
        severity: 'medium',
        category: 'add_not_null',
        table: c.table,
        column: c.column,
        message: `カラム "${c.table}.${c.column}" に NOT NULL 制約が追加されます。既存行に NULL があると ALTER に失敗します。`,
      })
    }
  }

  // ポリシー削除 (アクセス制御の "緩み" の可能性 — 削除すると default deny になるか、
  // 別のより許可的なポリシーが効くかは状況依存。情報として知らせる)
  for (const p of diff.droppedPolicies) {
    warnings.push({
      severity: 'low',
      category: 'drop_policy',
      table: p.table,
      policy: p.name,
      message: `ポリシー "${p.table}.${p.name}" が削除されます。このポリシーが許可していたアクセスが制限される可能性があります。`,
    })
  }

  // 注: 「ポリシーを締める方向の変更 (tighten_policy)」はセキュリティ強化なので警告しない。
  //     変更内容は差分サマリの before/after で確認できる。

  return warnings
}
