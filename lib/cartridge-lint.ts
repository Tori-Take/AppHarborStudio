/**
 * カートリッジ規約チェッカー。
 *
 * 実体は @appharbor/sdk/kit の共通検査エンジン（カートリッジ作成工程の再設計 Step 3）。
 * 本体（lib/cartridge/validator.ts）と同じエンジンを使うため、同じ壊れた manifest /
 * schema.sql を渡せばどちらのホストからも同じエラー一覧が返る。
 *
 * ここで渡す forbiddenImportPrefixes と、Studio 固有の外部パッケージ許可リストだけが
 * ホスト固有（Studio の内部モジュール・Studio が同梱する npm パッケージ）。
 *
 * 許可: @/sdk, @/sdk/client, @appharbor/sdk, @appharbor/sdk/client,
 *       react, react-dom, next/*, 相対 import, 標準 module
 * 禁止: @/lib/*, @/components/*, @/types/*, @/core/*, @/app/*
 *       および外部 npm パッケージのうち、Studio が許可していないもの
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname, relative } from 'path'
import { validateCartridge, type ValidationIssue } from '@appharbor/sdk/kit'

const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const IMPORT_REGEX = /(?:^|\s)(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g

const ALLOWED_AT_PATHS = new Set([
  '@/sdk',
  '@/sdk/client',
])

// Studio 固有: Studio 自身の内部モジュールをカートリッジに import させないファイアウォール
const FORBIDDEN_IMPORT_PREFIXES = [
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

/** kit の ValidationIssue → Studio の従来の LintIssue 形へ変換する */
function toLintIssue(i: ValidationIssue): LintIssue {
  return {
    file:     i.file ?? 'manifest.json',
    line:     i.line ?? 0,
    spec:     i.spec ?? i.rule ?? '-',
    severity: i.severity === 'warning' ? 'warn' : 'error',
    message:  i.message,
  }
}

export function lintCartridge(cartridgeDir: string): { issues: LintIssue[]; filesScanned: number } {
  // ─── 1. 共通エンジン（manifest フィールド・ディレクトリ構造・dataAccess・
  //         schema.sql の RLS/ポリシー・fullscreen 等）───
  const kitResult = validateCartridge(cartridgeDir, { forbiddenImportPrefixes: FORBIDDEN_IMPORT_PREFIXES })
  const issues: LintIssue[] = kitResult.issues.map(toLintIssue)

  // ─── 2. Studio 固有: 外部パッケージの許可リストチェック（kit は関知しない）───
  let filesScanned = 0
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
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      IMPORT_REGEX.lastIndex = 0
      let m
      while ((m = IMPORT_REGEX.exec(line)) !== null) {
        const spec = m[1]
        const v = classifyPackage(spec)
        if (v) issues.push({ file: rel, line: i + 1, spec, ...v })
      }
    }
  }

  scan(cartridgeDir)
  if (existsSync(join(cartridgeDir, 'db', 'schema.sql'))) filesScanned++

  return { issues, filesScanned }
}

/**
 * import 指定子を Studio 視点で分類する。
 * - 禁止プレフィックス（@/lib/ 等）は kit 側で既にエラー化済みなのでここでは無視
 * - それ以外の @/ 始まり（許可リストに無いもの）は「不明な内部 import」として警告
 * - 外部 npm パッケージは Studio の許可リストに無ければ警告
 */
function classifyPackage(spec: string): { severity: 'error' | 'warn'; message: string } | null {
  if (spec.startsWith('.')) return null  // 相対 import: OK

  if (spec.startsWith('@/')) {
    if (ALLOWED_AT_PATHS.has(spec) || spec.startsWith('@/sdk/')) return null
    if (FORBIDDEN_IMPORT_PREFIXES.some((p) => spec.startsWith(p))) return null // kit 側で既にエラー化済み
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

  return {
    severity: 'warn',
    message: `外部パッケージの import: ${spec}（Studio 標準依存ではない可能性）`,
  }
}
