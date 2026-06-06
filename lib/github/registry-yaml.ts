/**
 * cartridges-registry.yaml のテキストから指定 ID の ref 値を取得・置換する。
 * 純粋関数（GitHub API 不要）。
 *
 * YAML パーサを使わず行ベースで処理する（既存 cartridge-pr.ts と同じ方針）。
 */

/**
 * registry YAML 文字列から指定カートリッジの `ref` 値を抽出する。
 * 見つからなければ null。
 */
export function getRegistryRef(yaml: string, cartridgeId: string): string | null {
  const lines = yaml.split(/\r?\n/)
  let inTarget = false
  const escapedId = cartridgeId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const idRe = new RegExp(`^\\s+-\\s+id:\\s*${escapedId}\\s*$`)
  const anyIdRe = /^\s+-\s+id:\s*/
  const refRe = /^\s+ref:\s*(.+)$/

  for (const line of lines) {
    if (idRe.test(line)) {
      inTarget = true
      continue
    }
    if (inTarget) {
      // Hit next entry → stop
      if (anyIdRe.test(line)) return null
      const m = line.match(refRe)
      if (m) return m[1].trim()
    }
  }
  return null
}

/**
 * registry YAML 文字列の指定カートリッジの `ref` 行を newRef に置換した文字列を返す。
 * 他のカートリッジの行は一切変更しない。
 * 対象が見つからなければ throw する。
 */
export function updateRegistryRef(yaml: string, cartridgeId: string, newRef: string): string {
  const lines = yaml.split(/\r?\n/)
  let inTarget = false
  let found = false
  const escapedId = cartridgeId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const idRe = new RegExp(`^\\s+-\\s+id:\\s*${escapedId}\\s*$`)
  const anyIdRe = /^\s+-\s+id:\s*/
  const refRe = /^(\s+ref:\s*).+$/

  const result: string[] = []
  for (const line of lines) {
    if (idRe.test(line)) {
      inTarget = true
      result.push(line)
      continue
    }
    if (inTarget && anyIdRe.test(line)) {
      inTarget = false
    }
    if (inTarget) {
      const m = line.match(refRe)
      if (m) {
        result.push(`${m[1]}${newRef}`)
        found = true
        inTarget = false
        continue
      }
    }
    result.push(line)
  }

  if (!found) {
    throw new Error(`cartridge "${cartridgeId}" not found in registry YAML`)
  }
  return result.join('\n')
}
