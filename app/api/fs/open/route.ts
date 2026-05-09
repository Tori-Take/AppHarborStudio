import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { existsSync } from 'fs'

/**
 * 指定パスを OS のファイルマネージャで開く。
 *
 * - Windows: explorer.exe
 * - macOS:   open
 * - Linux:   xdg-open
 *
 * セキュリティ: 既存パスのみ許可・引数注入対策で path はスペース含めて1引数のまま渡す
 */
export async function POST(req: Request) {
  let body: { path?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid' }, { status: 400 }) }
  const target = body.path
  if (!target || !existsSync(target)) {
    return NextResponse.json({ error: 'path not found' }, { status: 404 })
  }

  const platform = process.platform
  let cmd: string, args: string[]
  if (platform === 'win32')      { cmd = 'explorer.exe';  args = [target] }
  else if (platform === 'darwin') { cmd = 'open';          args = [target] }
  else                            { cmd = 'xdg-open';      args = [target] }

  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
    child.unref()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
