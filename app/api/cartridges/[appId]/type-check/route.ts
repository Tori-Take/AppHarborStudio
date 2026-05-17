import { NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { join, resolve, relative } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'

/**
 * カートリッジに対してローカル TypeScript 型チェックを実行する。
 *
 * - tsc --noEmit を spawn して結果を取得
 * - 一時 tsconfig を生成し、対象カートリッジの routes/ だけを include
 * - paths は Studio の tsconfig を流用 (@/sdk → lib/sdk-mock)
 *
 * 出力: { ok: true } または { ok: false, errors: [{file,line,col,message}], rawOutput }
 *
 * 注: 初回実行は遅い (10-30 秒)。Vercel デプロイ環境では timeout する可能性。
 *     ローカル Studio 推奨。
 */

const STUDIO_ROOT = process.cwd()

type ParsedError = {
  file:    string
  line:    number
  col:     number
  code:    string
  message: string
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json({ ok: false, error: `cartridge ${safe} not found` }, { status: 404 })
  }

  const cartDir = entry.path
  const routesDir = join(cartDir, 'routes')
  if (!existsSync(routesDir)) {
    return NextResponse.json({ ok: false, error: `routes/ が見つかりません: ${routesDir}` }, { status: 400 })
  }

  // 一時 tsconfig を作成
  const tmpDir = join(STUDIO_ROOT, '.studio-db', 'type-check')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
  const tmpConfig = join(tmpDir, `${safe}.tsconfig.json`)

  // include パスは Studio root からの相対
  const routesGlob = relative(STUDIO_ROOT, resolve(routesDir, '**/*.{ts,tsx}')).replace(/\\/g, '/')

  const tsconfigContent = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      noEmit:      true,
      incremental: false,
      pretty:      false,
      tsBuildInfoFile: null,
    },
    include: [routesGlob],
    exclude: ['node_modules', 'workspace', '.next', '.studio-db'],
  }
  writeFileSync(tmpConfig, JSON.stringify(tsconfigContent, null, 2), 'utf-8')

  // tsc 実行
  const t0 = Date.now()
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--no-install', 'tsc', '--noEmit', '-p', tmpConfig],
    { cwd: STUDIO_ROOT, encoding: 'utf-8', timeout: 90_000, shell: false },
  )
  const duration = Date.now() - t0

  // 一時ファイル削除 (失敗してもエラーにしない)
  try { rmSync(tmpConfig) } catch { /* ignore */ }

  const stdout = (result.stdout || '').toString()
  const stderr = (result.stderr || '').toString()
  const rawOutput = stdout + (stderr ? '\n[stderr]\n' + stderr : '')

  if (result.error) {
    return NextResponse.json({
      ok:    false,
      errors: [],
      rawOutput,
      error: `tsc 起動失敗: ${result.error.message}`,
      duration,
    }, { status: 500 })
  }

  const errors = parseTscOutput(stdout)
  // status === 0 で errors なし = OK
  const ok = result.status === 0 && errors.length === 0

  return NextResponse.json({
    ok,
    errors,
    rawOutput: errors.length === 0 ? '' : rawOutput,
    exitCode:  result.status,
    duration,
    cartridgePath: cartDir,
  })
}

/** `path/to/file.ts(12,5): error TS2322: ...` 形式の tsc 出力を parse */
function parseTscOutput(output: string): ParsedError[] {
  const errors: ParsedError[] = []
  const re = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(output)) !== null) {
    errors.push({
      file:    m[1].replace(/\\/g, '/'),
      line:    parseInt(m[2], 10),
      col:     parseInt(m[3], 10),
      code:    m[4],
      message: m[5].trim(),
    })
  }
  return errors
}
