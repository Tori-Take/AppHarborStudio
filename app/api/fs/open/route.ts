import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

/**
 * 指定パスを OS のファイルマネージャで開く。
 *
 * - Windows: explorer.exe
 * - macOS:   open
 * - Linux:   xdg-open
 *
 * セキュリティ: 既存パスのみ許可・引数注入対策で path はスペース含めて1引数のまま渡す
 *
 * Windows の落とし穴:
 * - explorer.exe は正常起動でも exit code 1 を返すことがある → detached/unref で無視
 * - フォワードスラッシュより native セパレータの方が確実 → path.resolve で正規化
 * - spawn の 'error' イベントを取りこぼすと SIGSEGV する場合がある → リスナー必須
 */
export async function POST(req: Request) {
  let body: { path?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const raw = body.path
  if (!raw || typeof raw !== 'string') {
    return NextResponse.json({ error: 'path required' }, { status: 400 })
  }

  // Windows でフォワードスラッシュ混在を防ぐため native セパレータに正規化
  const target = resolve(raw)
  if (!existsSync(target)) {
    return NextResponse.json({ error: `path not found: ${target}` }, { status: 404 })
  }

  const platform = process.platform
  let cmd: string, args: string[]
  if (platform === 'win32') {
    // Windows のフォーカススチール抑止を回避するため、PowerShell で
    // explorer.exe を起動した直後に Alt キーの phantom press → SetForegroundWindow
    // を呼ぶ。これは Win32 の有名な workaround で、PS プロセスが
    // 「ユーザー入力直後」とみなされフォアグラウンド権が得られる。
    //
    // 単純な spawn('explorer.exe') / cmd start ではタスクバーが点滅するだけで
    // 前面に来ないので、この経路を使う。
    const escaped = target.replaceAll("'", "''")
    cmd  = 'powershell.exe'
    args = [
      '-NoProfile',
      '-WindowStyle', 'Hidden',
      '-Command',
      [
        `$ErrorActionPreference='SilentlyContinue'`,
        `Add-Type @'`,
        `using System;`,
        `using System.Runtime.InteropServices;`,
        `public class W {`,
        `  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, IntPtr extra);`,
        `  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);`,
        `  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);`,
        `}`,
        `'@`,
        `$before = @(Get-Process explorer -ErrorAction SilentlyContinue | ForEach-Object { $_.MainWindowHandle })`,
        `Start-Process explorer.exe -ArgumentList '${escaped}'`,
        `Start-Sleep -Milliseconds 500`,
        // Alt の phantom press: PS にフォアグラウンド権を一時的に与える
        `[W]::keybd_event(0x12, 0, 0, [IntPtr]::Zero)`,
        `[W]::keybd_event(0x12, 0, 2, [IntPtr]::Zero)`,
        // 新しく現れた explorer ウィンドウを探して前面化
        `$after = Get-Process explorer -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }`,
        `foreach ($p in $after) {`,
        `  if ($before -notcontains $p.MainWindowHandle) {`,
        `    [W]::ShowWindow($p.MainWindowHandle, 9) | Out-Null`,
        `    [W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null`,
        `    break`,
        `  }`,
        `}`,
      ].join('; '),
    ]
  } else if (platform === 'darwin') {
    cmd  = 'open'
    args = [target]
  } else {
    cmd  = 'xdg-open'
    args = [target]
  }

  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
    // spawn 自体は同期成功するが、後段の OS レイヤで失敗するとここで通知される
    child.on('error', (err) => {
      console.error('[api/fs/open] spawn error:', err)
    })
    child.unref()
    return NextResponse.json({ ok: true, path: target })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, path: target }, { status: 500 })
  }
}
