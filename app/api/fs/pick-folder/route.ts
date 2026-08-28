import { NextResponse } from 'next/server'
import { spawn } from 'child_process'

/**
 * OS のネイティブなフォルダ選択ダイアログを開いて、選ばれたパスを返す。
 *
 * 現状は Windows (PowerShell + System.Windows.Forms.FolderBrowserDialog) のみ対応。
 * 他 OS では 501。Studio はローカル開発ツールなので「同じマシンでダイアログを開く」
 * という前提で問題ない。
 *
 * 前面化について:
 *   旧スタイルの FolderBrowserDialog は、バックグラウンドで起動した PowerShell から
 *   開くとブラウザの背面に隠れて「ボタンを押しても何も起きない」ように見える。
 *   そこで AttachThreadInput + SetForegroundWindow で所有フォームを強制的に前面へ出し、
 *   その所有フォームをオーナーにしてダイアログを開くことで確実に最前面に表示する。
 *
 * 渡し方について:
 *   スクリプトは -EncodedCommand (base64 / UTF-16LE) で渡す。コマンドライン経由の
 *   引用符エスケープ事故 (C# の "..." が剥がれる等) を原理的に避けるため。
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
  // PowerShell シングルクォート文字列では ' のみ '' にエスケープ（\ はリテラルなので触らない）
  const title = (body.title ?? 'フォルダを選択').replace(/'/g, "''")

  // SelectedPath に空文字を渡すと例外になるので、初期パスがある時だけ設定行を足す。
  const initialLine = initialPath
    ? `$d.SelectedPath = '${initialPath.replace(/'/g, "''")}'`
    : ''

  const psScript = `
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class FgHelper {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("kernel32.dll")] static extern int GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(int a, int b, bool f);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  // バックグラウンドプロセスでもフォアグラウンドを奪えるよう、現在の前面ウィンドウの
  // 入力スレッドに一時的にアタッチしてから SetForegroundWindow する。
  public static void Force(IntPtr h) {
    IntPtr fg = GetForegroundWindow();
    int pid; int tFg = GetWindowThreadProcessId(fg, out pid);
    int tCur = GetCurrentThreadId();
    AttachThreadInput(tCur, tFg, true);
    BringWindowToTop(h);
    SetForegroundWindow(h);
    AttachThreadInput(tCur, tFg, false);
  }
}
"@
$form = New-Object System.Windows.Forms.Form
$form.StartPosition = 'CenterScreen'
$form.Width = 1
$form.Height = 1
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.Opacity = 0
$form.Show()
[FgHelper]::Force($form.Handle)
$form.Activate()
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = '${title}'
$d.ShowNewFolderButton = $true
${initialLine}
$result = $d.ShowDialog($form)
$form.Close()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }
`.trim()

  // -EncodedCommand は UTF-16LE の base64。引用符・改行・日本語をそのまま安全に渡せる。
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64')

  return new Promise<Response>((resolveResp) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-WindowStyle', 'Hidden',
      '-EncodedCommand', encoded,
    ])

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
      const path = stdout.trim()
      if (path) {
        resolveResp(NextResponse.json({ ok: true, path }))
        return
      }
      // 終了コードが非0 かつ パスも取れていない時だけエラー扱い。
      // (UseDescriptionForTitle 等の非終了エラーで stderr が出ても、
      //  パスが取れていれば成功・取れず exit 0 ならキャンセル扱いにする)
      if (code !== 0) {
        resolveResp(NextResponse.json(
          { error: `PowerShell エラー (code ${code}): ${stderr.trim()}` },
          { status: 500 },
        ))
        return
      }
      resolveResp(NextResponse.json({ ok: false, cancelled: true }))
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
