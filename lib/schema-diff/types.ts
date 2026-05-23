/**
 * Plan B (Stage 5 後の改修フロー) の共通型定義。
 *
 * - parser:          schema.sql → ParsedSchema
 * - diff:            ParsedSchema (released) + ParsedSchema (current) → SchemaDiff
 * - alter-generator: SchemaDiff → ALTER SQL (string)
 */

/** カラム 1 個分の構造 */
export type ParsedColumn = {
  /** カラム名 (小文字化済み) */
  name: string
  /** 型 (例: "uuid", "text", "integer", "varchar(50)") */
  type: string
  /** 型以降の制約をまとめた正規化文字列 (空白圧縮 + 小文字化済み) */
  constraintsRaw: string
  /** 元の SQL 文字列 (PR レビュー用) */
  raw: string
}

/** CREATE TABLE 1 個分の構造 */
export type ParsedTable = {
  /** テーブル名 (小文字化済み) */
  name: string
  /** if not exists 修飾子があるか */
  ifNotExists: boolean
  /** カラム一覧 */
  columns: ParsedColumn[]
  /** 元の CREATE TABLE 文 (CREATE 文を再現する用) */
  raw: string
}

/** RLS ポリシー 1 個分の構造 */
export type ParsedPolicy = {
  /** ポリシー名 (小文字化済み、クォート除去) */
  name: string
  /** 対象テーブル名 (小文字化済み) */
  table: string
  /**
   * 正規化された CREATE POLICY 文 (比較用):
   *   - 行コメント除去
   *   - 連続空白を 1 個に圧縮
   *   - 小文字化
   *   - 末尾 ; 除去
   */
  normalized: string
  /** 元の SQL 文 (生成時に再利用) */
  raw: string
}

/** schema.sql 全体のパース結果 */
export type ParsedSchema = {
  /** key: テーブル名, value: ParsedTable */
  tables: Map<string, ParsedTable>
  /**
   * key: "table:name" (例: "scores:scores_select"), value: ParsedPolicy
   * テーブル単位で名前衝突しても全体ユニークなキーになるよう table を含む
   */
  policies: Map<string, ParsedPolicy>
  /**
   * CREATE TABLE / CREATE POLICY 以外の文 (ALTER TABLE / function / trigger 等)。
   * diff 計算では使わず、初回 migration のときに「そのまま含める」用。
   */
  otherStatements: string[]
}

/** 1 つのカラム変更 (型または制約) */
export type ColumnChange = {
  table: string
  column: string
  before: ParsedColumn
  after: ParsedColumn
}

/** 1 つのポリシー変更 (CREATE POLICY 内容の変更) */
export type PolicyChange = {
  table: string
  name: string
  before: ParsedPolicy
  after: ParsedPolicy
}

/** schema 全体の差分 */
export type SchemaDiff = {
  /** 新規追加されたテーブル */
  newTables: ParsedTable[]
  /** 削除されたテーブル (破壊的) */
  droppedTables: ParsedTable[]
  /** 新規追加されたカラム (テーブル名と一緒に) */
  newColumns: Array<{ table: string; column: ParsedColumn }>
  /** 削除されたカラム (破壊的) */
  droppedColumns: Array<{ table: string; column: ParsedColumn }>
  /** 変更されたカラム (型または制約の変更。破壊的の可能性大) */
  changedColumns: ColumnChange[]
  /** 新規追加された RLS ポリシー */
  newPolicies: ParsedPolicy[]
  /** 削除された RLS ポリシー */
  droppedPolicies: ParsedPolicy[]
  /** 変更された RLS ポリシー */
  changedPolicies: PolicyChange[]
  /** 何も変わっていなければ true */
  isEmpty: boolean
}

/** 破壊的変更の警告 */
export type DestructiveWarning = {
  severity: 'high' | 'medium' | 'low'
  category:
    | 'drop_table'
    | 'drop_column'
    | 'change_type'
    | 'add_not_null'
    | 'drop_policy'
  table: string
  column?: string
  policy?: string
  message: string
}
