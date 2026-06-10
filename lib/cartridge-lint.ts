/**
 * カートリッジ規約チェッカー（静的 import 検査）
 *
 * カートリッジ内のコードをスキャンして、規約違反の import を検出する。
 *
 * 許可: @/sdk, @/sdk/client, @appharbor/sdk, @appharbor/sdk/client,
 *       react, react-dom, next/*, 相対 import, 標準 module
 * 禁止: @/lib/*, @/components/*, @/types/*, @/core/*, @/app/*
 *       および外部 npm パッケージのうち、Studio が許可していないもの
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname, relative } from 'path'

const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const IMPORT_REGEX = /(?:^|\s)(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g

const ALLOWED_AT_PATHS = new Set([
  '@/sdk',
  '@/sdk/client',
])

const FORBIDDEN_AT_PREFIXES = [
  '@/lib/',
  '@/components/',
  '@/types/',
  '@/core/',
  '@/app/',
]

const ALLOWED_PACKAGES = new Set([
  // SDK 契約パッケージ（tsconfig / webpack alias で sdk-mock に解決される）
  '@appharbor/sdk',
  '@appharbor/sdk/client',
  '@appharbor/sdk/types',
  'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime',
  // Studio が標準で同梱する peer dep（カートリッジが UI を内製する際に使う）
  'lucide-react',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  // Excel / PDF 出力用
  'xlsx',
])

const ALLOWED_PACKAGE_PREFIXES = [
  'next/',           // Next.js 標準
  'react/',
  '@base-ui/react/', // Studio 同梱の UI primitives
]

const NODE_BUILTINS = new Set([
  'fs', 'path', 'crypto', 'url', 'util', 'buffer', 'stream', 'events',
  'os', 'http', 'https', 'querystring', 'zlib',
])

export type LintIssue = {
  file:     string
  line:     number
  spec:     string
  severity: 'error' | 'warn'
  message:  string
}

export function lintCartridge(cartridgeDir: string): { issues: LintIssue[]; filesScanned: number } {
  const issues: LintIssue[] = []
  let filesScanned = 0
  let usesBackButton = false

  function scan(dir: string) {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const full = join(dir, name)
      const stat = statSync(full)
      if (stat.isDirectory()) scan(full)
      else if (SCAN_EXTS.has(extname(name))) {
        filesScanned++
        scanFile(full)
      }
    }
  }

  function scanFile(file: string) {
    const rel = relative(cartridgeDir, file)
    const lines = readFileSync(file, 'utf-8').split('\n')
    if (lines.some((l) => l.includes('BackToAppHarbor'))) usesBackButton = true
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      IMPORT_REGEX.lastIndex = 0
      let m
      while ((m = IMPORT_REGEX.exec(line)) !== null) {
        const spec = m[1]
        const v = classify(spec)
        if (v) issues.push({ file: rel, line: i + 1, spec, ...v })
      }
    }
  }

  scan(cartridgeDir)

  // 全画面カートリッジは戻るボタン必須（本体メニューが出ないため）
  const manifestPath = join(cartridgeDir, 'manifest.json')
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      if (manifest?.fullscreen === true && !usesBackButton) {
        issues.push({
          file: 'manifest.json',
          line: 0,
          spec: 'fullscreen',
          severity: 'error',
          message:
            'fullscreen: true のカートリッジには @/sdk/client の <BackToAppHarbor /> を' +
            '最低1箇所配置してください（全画面では本体メニューが出ないため、戻る導線が必須です）',
        })
      }
    } catch { /* manifest パースエラーは validator 側で扱う */ }
  }

  // db/schema.sql の規約チェック
  const schemaPath = join(cartridgeDir, 'db', 'schema.sql')
  if (existsSync(schemaPath)) {
    filesScanned++
    issues.push(...lintSchemaSql(schemaPath, cartridgeDir))
  }

  return { issues, filesScanned }
}

/**
 * db/schema.sql を解析して AppHarbor 規約に違反する箇所を検出する。
 *
 * 検出対象:
 *  - current_setting('app.*') 等の非標準セッション変数の使用 (← yoko-shoot で見つかった問題)
 *  - organization_id 列が無いテーブル
 *  - RLS が有効化されていないテーブル（organization_id を持つテーブルのみ警告）
 *  - auth.uid() を使わない RLS ポリシー（突合パターンが正しいか確認）
 */
function lintSchemaSql(schemaPath: string, cartridgeDir: string): LintIssue[] {
  const rel = relative(cartridgeDir, schemaPath)
  const sql = readFileSync(schemaPath, 'utf-8')
  const lines = sql.split('\n')
  const issues: LintIssue[] = []

  // 1. 非標準セッション変数 (current_setting('app.*'))
  const sessionVarRe = /current_setting\s*\(\s*['"]app\.[^'"]*['"]\s*\)/gi
  for (let i = 0; i < lines.length; i++) {
    sessionVarRe.lastIndex = 0
    const m = sessionVarRe.exec(lines[i])
    if (m) {
      issues.push({
        file: rel,
        line: i + 1,
        spec: m[0],
        severity: 'error',
        message:
          `非標準のセッション変数 ${m[0]}。AppHarbor では設定されないため動作しない。` +
          `「organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())」パターンに置き換えてください。`,
      })
    }
  }

  // 2. CREATE TABLE を抽出
  const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:[\w]+\.)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\);/gi
  type Table = { name: string; lineNum: number; body: string }
  const tables: Table[] = []
  let tm
  while ((tm = tableRe.exec(sql)) !== null) {
    const before = sql.slice(0, tm.index)
    const lineNum = before.split('\n').length
    tables.push({ name: tm[1], lineNum, body: tm[2] })
  }

  // 3. 各テーブルが organization_id を持つか / RLS が有効化されているか
  // （カートリッジ内テーブル名のセットを先に作っておく：サブテーブル判定で使う）
  const cartridgeTableNames = new Set(tables.map((t) => t.name))

  for (const t of tables) {
    // システム系・auth テーブルはスキップ
    if (t.name.startsWith('auth_') || t.name === 'organizations' || t.name === 'profiles') continue

    const hasOrgId = /\borganization_id\b/i.test(t.body)

    // RLS 有効化確認
    const rlsEnableRe = new RegExp(
      `alter\\s+table\\s+["\`]?${t.name}["\`]?\\s+enable\\s+row\\s+level\\s+security`,
      'i',
    )
    const rlsEnabled = rlsEnableRe.test(sql)

    // テーブルのポリシーを抽出
    const policyRe = new RegExp(
      `create\\s+policy\\s+[^\\s]+\\s+on\\s+["\`]?${t.name}["\`]?[\\s\\S]*?(?=;)`,
      'gi',
    )
    const policies = sql.match(policyRe) ?? []

    // organization_id 直接列が無い場合は「サブテーブル」例外を判定する。
    // サブテーブル = ポリシー本文がカートリッジ内の別テーブル(親) に対して
    // organization_id を辿るサブクエリを持つ。例:
    //   USING (sheet_id IN (SELECT id FROM patrol_check_sheets
    //                       WHERE organization_id = ...))
    let isSubTable = false
    if (!hasOrgId && policies.length > 0) {
      for (const p of policies) {
        // SELECT ... FROM <親テーブル> WHERE organization_id = ...
        const subqueryRe = /from\s+["`]?(\w+)["`]?[\s\S]*?\borganization_id\b/gi
        let sm
        while ((sm = subqueryRe.exec(p)) !== null) {
          if (cartridgeTableNames.has(sm[1])) { isSubTable = true; break }
        }
        if (isSubTable) break
      }
    }

    if (!hasOrgId && !isSubTable) {
      issues.push({
        file: rel,
        line: t.lineNum,
        spec: `table ${t.name}`,
        severity: 'warn',
        message:
          `テーブル "${t.name}" に organization_id 列がありません。` +
          `テナント境界を担保するため、organization_id を追加するか、` +
          `親テーブル経由でテナント境界を辿る RLS ポリシーを書いてください。`,
      })
      continue
    }

    if (!rlsEnabled) {
      issues.push({
        file: rel,
        line: t.lineNum,
        spec: `table ${t.name}`,
        severity: 'error',
        message:
          `テーブル "${t.name}" で RLS が有効化されていません。` +
          `\`alter table ${t.name} enable row level security;\` を追加してください。`,
      })
    }

    if (policies.length === 0) {
      issues.push({
        file: rel,
        line: t.lineNum,
        spec: `table ${t.name}`,
        severity: 'error',
        message:
          `テーブル "${t.name}" に RLS ポリシーがありません。` +
          `select / insert / delete のポリシーを定義してください。`,
      })
    } else {
      // 各ポリシーが AppHarbor の許容パターンを使っているか
      // 許容: auth.uid() / auth.jwt()（後者は organization_id クレーム参照の標準パターン）
      for (const policy of policies) {
        const usesAuthUid = /auth\.uid\s*\(\s*\)/.test(policy)
        const usesAuthJwt = /auth\.jwt\s*\(\s*\)/.test(policy)
        if (!usesAuthUid && !usesAuthJwt) {
          const nameMatch = policy.match(/create\s+policy\s+([^\s]+)/i)
          const policyName = nameMatch?.[1] ?? '(unknown)'
          const idx = sql.indexOf(policy)
          const lineNum = sql.slice(0, idx).split('\n').length

          issues.push({
            file: rel,
            line: lineNum,
            spec: policyName,
            severity: 'warn',
            message:
              `RLS ポリシー "${policyName}" が auth.uid() / auth.jwt() のいずれも使っていません。` +
              `AppHarbor 標準パターン:` +
              `(a)「organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())」` +
              ` または ` +
              `(b)「organization_id = (auth.jwt() ->> 'organization_id')::uuid」`,
          })
        }
      }
    }
  }

  return issues
}

function classify(spec: string): { severity: 'error' | 'warn'; message: string } | null {
  if (spec.startsWith('.')) return null  // 相対 import: OK

  if (spec.startsWith('@/')) {
    if (ALLOWED_AT_PATHS.has(spec) || spec.startsWith('@/sdk/')) return null
    for (const p of FORBIDDEN_AT_PREFIXES) {
      if (spec.startsWith(p)) {
        return {
          severity: 'error',
          message: `禁止 import: ${spec} は本体に依存しています（@/sdk 経由に置き換えてください）`,
        }
      }
    }
    return {
      severity: 'warn',
      message: `不明な @/ 始まりの import: ${spec}`,
    }
  }

  if (NODE_BUILTINS.has(spec) || spec.startsWith('node:')) return null
  if (ALLOWED_PACKAGES.has(spec)) return null
  for (const p of ALLOWED_PACKAGE_PREFIXES) {
    if (spec.startsWith(p)) return null
  }

  // それ以外は外部パッケージ → 警告
  return {
    severity: 'warn',
    message: `外部パッケージの import: ${spec}（Studio 標準依存ではない可能性）`,
  }
}
