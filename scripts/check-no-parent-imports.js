#!/usr/bin/env node
/**
 * check-no-parent-imports.js
 *
 * Studio フォルダ内のコードが親フォルダ（AppHarbor 本体）を import していないか検証する。
 * `'../` で始まる相対 import で、Studio フォルダ外を参照しているものを検出。
 *
 * 設計書: docs/design-summary.md「Studio フォルダ独立性の原則」
 */

const fs = require('fs')
const path = require('path')

const STUDIO_ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'lib']
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const importRegex = /(?:^|\s)(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g

let violations = 0

function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(full)
    } else if (EXTS.has(path.extname(name))) {
      checkFile(full)
    }
  }
}

function checkFile(file) {
  const content = fs.readFileSync(file, 'utf-8')
  let m
  importRegex.lastIndex = 0
  while ((m = importRegex.exec(content)) !== null) {
    const spec = m[1]
    if (!spec.startsWith('.')) continue
    const resolved = path.resolve(path.dirname(file), spec)
    if (!resolved.startsWith(STUDIO_ROOT)) {
      console.error(`  ❌ ${path.relative(STUDIO_ROOT, file)}`)
      console.error(`     import "${spec}" → ${resolved}`)
      violations++
    }
  }
}

console.log('[check-no-parent-imports] Studio フォルダ独立性をチェックします')
console.log('')
for (const d of SCAN_DIRS) walk(path.join(STUDIO_ROOT, d))
console.log('')

if (violations > 0) {
  console.error(`✗ ${violations} 件の違反を検出しました（親フォルダを import しています）`)
  console.error('  Studio は単独動作が原則です。外部参照は禁止されています。')
  process.exit(1)
} else {
  console.log('✓ 違反なし — Studio は完全に自己完結しています')
}
