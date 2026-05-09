import { NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import { resolveCartridgesPath } from '@/lib/config'

/**
 * Studio のサイドバー用に、環境情報をまとめて返すエンドポイント。
 *
 * - cartridgesPath: 解決済みカートリッジ置き場
 * - productionUrl:  STUDIO_PRODUCTION_URL（既定: https://appharbor.vercel.app）
 * - branch:         git の現在ブランチ
 * - inSync:         dirty/unpushed が無いか（簡易チェック）
 */
export async function GET() {
  const cartridgesPath = resolveCartridgesPath()
  const productionUrl  = process.env.STUDIO_PRODUCTION_URL ?? 'https://appharbor.vercel.app'

  let branch = 'unknown'
  let inSync = true
  try {
    const probeCwd = cartridgesPath
    const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: probeCwd, encoding: 'utf-8' })
    if (branchRes.status === 0) branch = branchRes.stdout.trim()

    const dirtyRes = spawnSync('git', ['status', '--porcelain'], { cwd: probeCwd, encoding: 'utf-8' })
    const unpushedRes = spawnSync('git', ['log', 'origin/HEAD..HEAD', '--oneline'], { cwd: probeCwd, encoding: 'utf-8' })
    if ((dirtyRes.stdout || '').trim() || (unpushedRes.stdout || '').trim()) {
      inSync = false
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    cartridgesPath,
    productionUrl,
    branch,
    inSync,
  })
}
