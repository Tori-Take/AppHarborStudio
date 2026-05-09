#!/usr/bin/env node
/**
 * predev / prebuild 用フック
 *
 * 親フォルダが存在する時のみ sync-types.js を実行する。
 * 単独配布時は何もしない（凍結された type 定義を使う）。
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const PARENT_PKG = path.resolve(__dirname, '..', '..', 'package.json')

if (!fs.existsSync(PARENT_PKG)) {
  // 単独配布時 — 何もしない
  process.exit(0)
}

try {
  execSync('node ' + path.join(__dirname, 'sync-types.js'), { stdio: 'inherit' })
} catch (e) {
  console.warn('[sync-types-if-parent-exists] sync-types.js でエラー:', e.message)
  // ビルドは止めない
}
