import { NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import { existsSync, readdirSync, statSync, utimesSync } from 'fs'
import { join } from 'path'

/**
 * mount-cartridges.js を起動して、cartridges/ → app/org/[slug]/apps/ への展開を再実行する。
 *
 * その後、生成された .tsx / .ts / .sql ファイルの mtime を強制的に「今」に更新して、
 * Next.js dev server の webpack watcher が確実にコンパイルキャッシュを破棄するようにする。
 *
 * 背景: copyFileSync で書かれたファイルは内容によっては watcher の検知をすり抜け、
 *       古いコンパイル結果がプレビューに出続ける問題があった。
 */
export async function POST() {
  const script = join(process.cwd(), 'scripts', 'mount-cartridges.js')
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  })
  if (result.status !== 0) {
    return NextResponse.json(
      { error: 'mount failed', stderr: result.stderr, stdout: result.stdout },
      { status: 500 },
    )
  }

  // mount 先のファイルすべてに touch（mtime を更新）
  const playBase = join(process.cwd(), 'app', 'org', '[slug]', 'apps')
  let touched = 0
  if (existsSync(playBase)) {
    touched = touchRecursive(playBase)
  }

  return NextResponse.json({
    ok: true,
    output: result.stdout,
    touched,
  })
}

/** 指定パス配下の .tsx/.ts/.sql/.json/.css ファイルの mtime を現在時刻に更新 */
function touchRecursive(dir: string): number {
  let count = 0
  const now = new Date()
  const walk = (current: string) => {
    let entries: string[]
    try { entries = readdirSync(current) } catch { return }
    for (const name of entries) {
      const full = join(current, name)
      let stat
      try { stat = statSync(full) } catch { continue }
      if (stat.isDirectory()) {
        walk(full)
      } else if (/\.(tsx?|sql|json|css)$/i.test(name)) {
        try {
          utimesSync(full, now, now)
          count++
        } catch { /* ignore */ }
      }
    }
  }
  walk(dir)
  return count
}
