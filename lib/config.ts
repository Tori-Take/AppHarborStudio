import { existsSync } from 'fs'
import { resolve } from 'path'

/**
 * カートリッジ置き場の解決
 *
 * 優先順位:
 *   1. 環境変数 STUDIO_CARTRIDGES_PATH
 *   2. ./cartridges（単独配布時・ローカル）
 *   3. 親フォルダの ../cartridges（AppHarbor 内で動作している時）
 *   4. ./workspace（フォールバック）
 */
export function resolveCartridgesPath(): string {
  if (process.env.STUDIO_CARTRIDGES_PATH) {
    return resolve(process.cwd(), process.env.STUDIO_CARTRIDGES_PATH)
  }
  const localCartridges = resolve(process.cwd(), 'cartridges')
  if (existsSync(localCartridges)) return localCartridges
  const parentCartridges = resolve(process.cwd(), '..', 'cartridges')
  if (existsSync(parentCartridges)) return parentCartridges
  return resolve(process.cwd(), 'workspace')
}

export const STUDIO_ORG_SLUG = 'studio-sandbox'
