import { writeFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

/**
 * dev-supervisor.js が watch している flag ファイルを touch する。
 * supervisor が flag のタイムスタンプ進行を検出すると:
 *   - dev process kill
 *   - .next 削除
 *   - 再 spawn
 * の流れを実行する。
 *
 * このエンドポイント自身も再起動される dev server に存在するため、
 * レスポンスを返した直後にプロセスごと kill される (浅い眠りのまま死ぬ)。
 * クライアント側は /api/studio/health をポーリングして復活を待つ。
 */
export async function POST() {
  const flag = join(process.cwd(), '.studio-restart-flag')
  try {
    writeFileSync(flag, String(Date.now()))
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    )
  }
  return NextResponse.json(
    { ok: true, message: 'dev-supervisor に再起動シグナルを送信しました' },
    { status: 202 },
  )
}
