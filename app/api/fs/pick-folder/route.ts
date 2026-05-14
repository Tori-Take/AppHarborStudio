import { NextResponse } from 'next/server'
import { spawn } from 'child_process'

/**
 * OS のネイティブなフォルダ選択ダイアログを開いて、選ばれたパスを返す。
 *
 * 現状は Windows (PowerShell + System.Windows.Forms.FolderBrowserDialog) のみ対応。
 * 他 OS では 501。Studio はローカル開発ツールなので「同じマシンでダイアログを開く」
 * という前提で問題ない。
 *
 * Request body:
 *   { initialPath?: string; title?: string }
 *
 * Response:
 *   - 選択: { ok: true, path: '<absolute path>' }
 *   - キャンセル: { ok: false, cancelled: true }
 *   - エラー: { error: '...' }
 */
export async function POST(req: Request) {
  let body: { initialPath?: string; title?: string }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  if (process.platform !== 'win32') {
    return NextResponse.json(
      { error: 'フォルダピッカーは Windows のみ対応しています。パスを手入力してください。' },
      { status: 501 },
    )
  }

  const initialPath = (body.initialPath ?? '').trim()
  const title       = (body.title ?? 'フォルダを選択').replace(/'/g, "''")

  // PowerShell スクリプトを構築。SelectedPath に空文字を渡すと例外になるので分岐。
  const initialLine = initialPath
    ? `$d.SelectedPath = '${initialPath.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
    : ''

  const psScript = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$d.Description = '${title}'`,
    "$d.UseDescriptionForTitle = $true",
    "$d.ShowNewFolderButton = $true",
    initialLine,
    // ダイアログを最前面に出すための隠しフォーム
    "$tmp = New-Object System.Windows.Forms.Form",
    "$tmp.TopMost = $true",
    "$tmp.Show()",
    "$tmp.Activate()",
    "$result = $d.ShowDialog($tmp)",
    "$tmp.Close()",
    "if ($result -eq 'OK') { Write-Output $d.SelectedPath }",
  ].filter(Boolean).join('\n')

  return new Promise<Response>((resolveResp) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-WindowStyle', 'Hidden',
      '-Command', psScript,
    ], { encoding: 'utf-8' })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf-8') })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf-8') })

    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      resolveResp(NextResponse.json(
        { error: 'タイムアウト (5 分)' },
        { status: 504 },
      ))
    }, 5 * 60 * 1000)

    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        resolveResp(NextResponse.json(
          { error: `PowerShell エラー (code ${code}): ${stderr.trim()}` },
          { status: 500 },
        ))
        return
      }
      const path = stdout.trim()
      if (!path) {
        resolveResp(NextResponse.json({ ok: false, cancelled: true }))
        return
      }
      resolveResp(NextResponse.json({ ok: true, path }))
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolveResp(NextResponse.json(
        { error: `PowerShell 起動エラー: ${err.message}` },
        { status: 500 },
      ))
    })
  })
}
