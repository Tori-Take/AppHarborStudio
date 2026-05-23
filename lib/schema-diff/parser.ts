/**
 * シンプルな PostgreSQL schema パーサ (Plan B 用)。
 *
 * 目的:
 *   - CREATE TABLE 文を構造化データに変換し、diff 計算に使う
 *   - CREATE TABLE 以外の文 (RLS, policy 等) はそのまま保持
 *
 * 制限:
 *   - SQL の完全パースはしない (PostgREST レベルの精度は目指さない)
 *   - 文字列内の `;` `(` `)` には対応するが、`$$...$$` (function body) は未対応
 */
import type { ParsedColumn, ParsedPolicy, ParsedSchema, ParsedTable } from './types'

/** schema.sql 全体をパースする */
export function parseSchema(sql: string): ParsedSchema {
  const tables = new Map<string, ParsedTable>()
  const policies = new Map<string, ParsedPolicy>()
  const otherStatements: string[] = []

  const statements = splitStatements(sql)
  for (const stmt of statements) {
    // 先頭の空白と行コメント (-- ...) を除去
    // (splitStatements は ; までを 1 文として返すため、直前の文末改行 +
    //  ヘッダコメント + 本体文 のような形になっており、^create table が効かない)
    const cleaned = stripLeadingNoise(stmt)
    if (!cleaned) continue

    // 1. CREATE TABLE
    const table = tryParseCreateTable(cleaned)
    if (table) {
      tables.set(table.name, table)
      continue
    }

    // 2. CREATE POLICY
    const policy = tryParseCreatePolicy(cleaned)
    if (policy) {
      policies.set(`${policy.table}:${policy.name}`, policy)
      continue
    }

    // 3. DROP POLICY ... は idempotent パターン用なので diff には関与させない
    if (/^drop\s+policy\b/i.test(cleaned)) {
      continue
    }

    // 4. その他 (ALTER TABLE / function / trigger / CREATE INDEX 等)
    otherStatements.push(cleaned)
  }

  return { tables, policies, otherStatements }
}

/** 文の先頭にある空白と行コメントを除去する */
function stripLeadingNoise(s: string): string {
  let i = 0
  while (i < s.length) {
    // 空白 (改行含む)
    if (/\s/.test(s[i])) {
      i++
      continue
    }
    // 行コメント
    if (s[i] === '-' && s[i + 1] === '-') {
      while (i < s.length && s[i] !== '\n') i++
      continue
    }
    break
  }
  return s.slice(i).trim()
}

/**
 * SQL を文 (`;` 区切り) に分割する。
 *
 * 注意:
 *   - 文字列内 (`'...'`) や行コメント (`-- ...`) の `;` は無視
 *   - 括弧の深さは考慮しない (PostgreSQL の標準 SQL では文の途中の `;` はない)
 */
function splitStatements(sql: string): string[] {
  const out: string[] = []
  let buf = ''
  let inString = false
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]

    // -- 行コメント
    if (!inString && c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        buf += sql[i]
        i++
      }
      continue
    }

    // 文字列リテラル
    if (c === "'") {
      // エスケープ ('') は単純連結で扱える
      buf += c
      inString = !inString
      i++
      continue
    }

    // 文末
    if (c === ';' && !inString) {
      buf += c
      out.push(buf)
      buf = ''
      i++
      continue
    }

    buf += c
    i++
  }
  if (buf.trim()) out.push(buf)
  return out
}

/** 1 文が CREATE TABLE なら ParsedTable を返す。それ以外は null */
function tryParseCreateTable(stmt: string): ParsedTable | null {
  // 先頭の "create table" を許容形式でマッチ
  const headRe = /^\s*create\s+table\s+(if\s+not\s+exists\s+)?["']?([\w.]+)["']?\s*\(/i
  const headMatch = stmt.match(headRe)
  if (!headMatch) return null

  const ifNotExists = !!headMatch[1]
  const rawName = headMatch[2]
  // "studio.foo" のようなスキーマ修飾は捨てる
  const name = rawName.includes('.') ? rawName.split('.').pop()! : rawName

  // ( の位置を特定
  const openIdx = stmt.indexOf('(', headMatch.index! + headMatch[0].length - 1)
  if (openIdx < 0) return null

  // 対応する ) を探す (括弧の深さ管理)
  let depth = 1
  let j = openIdx + 1
  let inString = false
  while (j < stmt.length && depth > 0) {
    const c = stmt[j]
    if (c === "'") inString = !inString
    if (!inString) {
      if (c === '(') depth++
      else if (c === ')') depth--
    }
    if (depth > 0) j++
  }
  if (depth !== 0) return null

  const body = stmt.slice(openIdx + 1, j)
  const columns = parseColumns(body)

  return {
    name: name.toLowerCase(),
    ifNotExists,
    columns,
    raw: stmt,
  }
}

/** CREATE TABLE の () 内をパースしてカラム配列にする */
function parseColumns(body: string): ParsedColumn[] {
  const lines = splitTopLevelCommas(body)
  const columns: ParsedColumn[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // テーブル制約はスキップ (CONSTRAINT, PRIMARY KEY (...), UNIQUE (...), CHECK (...), FOREIGN KEY (...))
    if (/^(constraint|primary\s+key|unique|check|foreign\s+key|exclude)\b/i.test(line)) continue

    // カラム名と型を抽出
    // パターン: <name> <type> [<modifiers>]
    // 型は ( ) を含む可能性あり (varchar(50), numeric(10,2))
    const m = line.match(/^["']?(\w+)["']?\s+([\w\s]+(?:\([^)]*\))?)\s*(.*)$/i)
    if (!m) {
      // パース不能でも捨てる (テーブル制約の見落としなど)
      continue
    }

    const name = m[1].toLowerCase()
    const type = normalizeType(m[2])
    const rest = (m[3] || '').trim()
    const constraintsRaw = normalizeConstraints(rest)

    columns.push({
      name,
      type,
      constraintsRaw,
      raw: line,
    })
  }

  return columns
}

/**
 * トップレベルの `,` で分割する。文字列内 / 括弧内の `,` は分割しない。
 */
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = []
  let buf = ''
  let depth = 0
  let inString = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'") inString = !inString
    if (!inString) {
      if (c === '(') depth++
      else if (c === ')') depth--
      if (c === ',' && depth === 0) {
        out.push(buf)
        buf = ''
        continue
      }
    }
    buf += c
  }
  if (buf.trim()) out.push(buf)
  return out
}

/** 型を正規化 ("INTEGER" → "integer", "  VARCHAR  (50)" → "varchar(50)") */
function normalizeType(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*,\s*/g, ',')
}

/** 制約部分を正規化 (空白圧縮、小文字化) */
function normalizeConstraints(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** 1 文が CREATE POLICY なら ParsedPolicy を返す。それ以外は null */
function tryParseCreatePolicy(stmt: string): ParsedPolicy | null {
  // create policy [if not exists] <name> on <table> ...
  // <name> は識別子 or "quoted" or 'quoted'
  // <table> は schema.table or table、quote 可
  const headRe =
    /^\s*create\s+policy\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|'([^']+)'|(\w+))\s+on\s+(?:"([^"]+)"|'([^']+)'|([\w.]+))/i
  const m = stmt.match(headRe)
  if (!m) return null

  const name = (m[1] ?? m[2] ?? m[3] ?? '').toLowerCase()
  const rawTable = m[4] ?? m[5] ?? m[6] ?? ''
  // schema.foo のスキーマ修飾は捨てる
  const table = (rawTable.includes('.') ? rawTable.split('.').pop()! : rawTable).toLowerCase()
  if (!name || !table) return null

  return {
    name,
    table,
    normalized: normalizeStatement(stmt),
    raw: stmt.trim(),
  }
}

/**
 * 1 文を比較用に正規化する。
 *   - 行コメント (-- ...) を除去
 *   - 連続空白 (改行含む) を 1 個に圧縮
 *   - 小文字化
 *   - 末尾 ; 除去
 */
function normalizeStatement(stmt: string): string {
  // 行コメント除去
  const withoutComments = stmt
    .split('\n')
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
  return withoutComments
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/;\s*$/, '')
    .toLowerCase()
}
