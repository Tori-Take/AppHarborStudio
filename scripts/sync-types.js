#!/usr/bin/env node
/**
 * sync-types.js
 *
 * AppHarbor 本体（親フォルダ）から SDK の型定義を取り込んで
 * Studio 内 (lib/sdk-mock/types-synced.ts) にコピーする。
 *
 * - 単独配布時は親フォルダが存在しないため、最後に同期した状態で凍結される
 * - studio フォルダ内のコードは @/sdk/types から import する想定
 *
 * Phase 1 では参考情報の出力のみ。types.ts は手動メンテで運用する。
 * Phase 2 以降で実コピー処理を有効化する。
 */

const fs = require('fs')
const path = require('path')

const PARENT_ROOT = path.resolve(__dirname, '..', '..')
const SOURCES = [
  { src: 'lib/auth/requireOrgAccess.ts', desc: 'OrgActor 型' },
  { src: 'lib/sdk/requireApp.ts',        desc: 'AppContext 型' },
  { src: 'lib/cartridge/spec.ts',        desc: 'カートリッジ仕様型' },
]

function main() {
  if (!fs.existsSync(PARENT_ROOT)) {
    console.log('[sync-types] 親フォルダが見つかりません（単独配布時の正常動作）')
    return
  }

  console.log('[sync-types] AppHarbor 本体から型定義を確認します')
  console.log('[sync-types] root:', PARENT_ROOT)
  console.log('')

  let missing = 0
  for (const { src, desc } of SOURCES) {
    const full = path.join(PARENT_ROOT, src)
    if (fs.existsSync(full)) {
      console.log(`  ✅ ${src}  (${desc})`)
    } else {
      console.log(`  ❌ ${src}  (${desc}) — 見つかりません`)
      missing++
    }
  }
  console.log('')

  if (missing > 0) {
    console.log(`[sync-types] ${missing} 件のソースが見つかりませんでした`)
  }

  console.log('[sync-types] Phase 1 では手動メンテ運用です。')
  console.log('  本体側の型を変更したら lib/sdk-mock/types.ts を手で更新してください。')
  console.log('  Phase 2 以降で自動コピーに切り替える予定です。')
}

main()
