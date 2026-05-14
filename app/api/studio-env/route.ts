import { NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import { networkInterfaces } from 'os'
import { resolve } from 'path'
import QRCode from 'qrcode'
import { resolveCartridgesPath } from '@/lib/config'

function getLocalIp(): string | null {
  const nets = networkInterfaces()
  for (const addrs of Object.values(nets)) {
    if (!addrs) continue
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return null
}

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

  const localIp = getLocalIp()
  const port = process.env.PORT ?? '3200'
  const localUrl = localIp ? `http://${localIp}:${port}` : null

  let qrDataUrl: string | null = null
  if (localUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(localUrl, { width: 160, margin: 2 })
    } catch { /* ignore */ }
  }

  // 新規カートリッジ作成時のデフォルト親フォルダ (Studio の親)
  // 例: C:/.../Projects/AppHarborStudio → C:/.../Projects
  const defaultCartridgeParent = resolve(process.cwd(), '..')

  return NextResponse.json({
    cartridgesPath,
    defaultCartridgeParent,
    productionUrl,
    branch,
    inSync,
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    localUrl,
    qrDataUrl,
  })
}
