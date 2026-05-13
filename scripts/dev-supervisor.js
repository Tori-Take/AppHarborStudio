#!/usr/bin/env node
/**
 * Studio dev server supervisor
 *
 * Why: Next.js dev は自分自身を kill & restart できない。
 * webpack キャッシュが固着した時 (HMR が止まった / 古いチャンクが返る)、
 * .next を消して再起動が必要。Studio UI からこの操作を可能にするため、
 * 「親プロセス (supervisor)」が dev server を子プロセスとして管理する。
 *
 * 動作:
 *   1. `next dev` を子プロセスとして起動
 *   2. STUDIO_ROOT/.studio-restart-flag を 500ms ごとに watch
 *   3. flag のタイムスタンプが進んだら:
 *        - 子プロセスを kill (Windows: taskkill /T /F, Unix: SIGTERM)
 *        - .next ディレクトリを削除
 *        - flag を消す
 *        - 1 秒待機して再 spawn
 *   4. Ctrl+C で子プロセスごと終了
 *
 * フラグ生成側: studio/app/api/studio/restart-dev/route.ts が touch する。
 *
 * このスクリプトは npm run dev のエントリポイント。supervisor 経由したくない時は
 * `npm run dev:raw` を使う。
 */

const { spawn } = require('child_process')
const { existsSync, rmSync, statSync, watch, copyFileSync, mkdirSync, readdirSync, unlinkSync } = require('fs')
const { join, resolve, relative, dirname, sep } = require('path')

const STUDIO_ROOT = process.cwd()
const FLAG_FILE   = join(STUDIO_ROOT, '.studio-restart-flag')
const NEXT_DIR    = join(STUDIO_ROOT, '.next')
const PLAY_BASE   = join(STUDIO_ROOT, 'app', 'org', '[slug]', 'apps')

let child         = null
let lastFlagMTime = 0
let restarting    = false
let shuttingDown  = false
let cartridgeWatcher = null

function runMount() {
  return new Promise((resolve) => {
    console.log('[supervisor] 🔧 mount-cartridges を実行...')
    const m = spawn('node', ['scripts/mount-cartridges.js'], {
      cwd:   STUDIO_ROOT,
      stdio: 'inherit',
      shell: true,
    })
    m.on('exit', resolve)
    m.on('error', resolve)
  })
}

async function spawnChild() {
  await runMount()  // dev 起動前に必ず最新のカートリッジファイルをマウント
  console.log('\n[supervisor] 🟢 next dev を起動します')
  child = spawn('npm', ['run', 'dev:raw'], {
    cwd:   STUDIO_ROOT,
    stdio: 'inherit',
    shell: true,
  })
  child.on('exit', (code, sig) => {
    if (shuttingDown || restarting) return
    console.log(`\n[supervisor] dev process が終了 (code=${code}, sig=${sig})。supervisor も終了します。`)
    process.exit(code ?? 0)
  })
  child.on('error', (err) => {
    console.error('[supervisor] spawn エラー:', err.message)
  })
}

function killChild() {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve()
    const pid = child.pid
    if (!pid) return resolve()

    let resolved = false
    const done = () => { if (!resolved) { resolved = true; resolve() } }

    if (process.platform === 'win32') {
      // 子孫プロセスごと kill
      const killer = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], { shell: true })
      killer.on('exit', done)
      killer.on('error', done)
      setTimeout(done, 3000)  // taskkill が遅い時の保険
    } else {
      try { process.kill(-pid, 'SIGTERM') } catch { /* */ }
      setTimeout(() => {
        try { process.kill(-pid, 'SIGKILL') } catch { /* */ }
        done()
      }, 1500)
    }
  })
}

function rmNextDir(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      rmSync(NEXT_DIR, { recursive: true, force: true })
      return true
    } catch (e) {
      if (i === retries - 1) {
        console.error('[supervisor] ✗ .next 削除失敗:', e.message)
        return false
      }
      // Windows のファイルロック対策で少し待つ
      const start = Date.now()
      while (Date.now() - start < 500) { /* spin */ }
    }
  }
  return false
}

async function performRestart() {
  if (restarting) return
  restarting = true
  console.log('\n[supervisor] 🔁 再起動シグナル検出 — 開始します')

  await killChild()
  child = null
  console.log('[supervisor] ✓ dev process を kill')

  if (rmNextDir()) console.log('[supervisor] ✓ .next を削除')

  try { rmSync(FLAG_FILE, { force: true }) } catch { /* */ }

  // dev サーバが完全に解放されるのを待つ
  await new Promise(r => setTimeout(r, 1000))

  await spawnChild()
  restarting = false
  console.log('[supervisor] ✓ 再起動完了 (HMR 完了は dev server のログを参照)\n')
}

// ── Cartridge auto-sync ──────────────────────────────────────
function resolveCartridgesRoot() {
  if (process.env.STUDIO_CARTRIDGES_PATH) {
    return resolve(STUDIO_ROOT, process.env.STUDIO_CARTRIDGES_PATH)
  }
  const local = join(STUDIO_ROOT, 'cartridges')
  if (existsSync(local)) return local
  const parent = resolve(STUDIO_ROOT, '..', 'cartridges')
  if (existsSync(parent)) return parent
  return join(STUDIO_ROOT, 'workspace')
}

/**
 * 渡された相対パス (例: "patrol-navi/routes/admin/page.tsx",
 *                   "_local/patrol-navi/routes/admin/page.tsx") を
 * <cartridge-id, route-relative-path> に解釈し、PLAY_BASE/<id>/<route> へコピー。
 */
function syncFile(cartridgesRoot, relPath) {
  const parts = relPath.split(/[/\\]/)
  let cartridgeId, routesIdx
  if (parts[0] === '_local' || parts[0] === '_installed') {
    cartridgeId = parts[1]
    routesIdx   = 2
  } else {
    cartridgeId = parts[0]
    routesIdx   = 1
  }
  if (!cartridgeId || cartridgeId.startsWith('_') || cartridgeId.startsWith('.')) return

  // routes/ 配下のみ同期対象
  if (parts[routesIdx] !== 'routes' || parts.length < routesIdx + 2) return

  const routeRel = parts.slice(routesIdx + 1).join(sep)
  const src  = join(cartridgesRoot, relPath)
  const dest = join(PLAY_BASE, cartridgeId, routeRel)

  try {
    if (existsSync(src) && statSync(src).isFile()) {
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
      console.log(`[auto-sync] ✓ ${cartridgeId}/${routeRel}`)
    } else if (!existsSync(src)) {
      // file deleted
      try {
        unlinkSync(dest)
        console.log(`[auto-sync] 🗑 ${cartridgeId}/${routeRel}`)
      } catch { /* dest may not exist */ }
    }
  } catch (e) {
    console.error(`[auto-sync] ✗ ${relPath}:`, e.message)
  }
}

/**
 * 監視対象のカートリッジディレクトリを列挙する。
 *   - cartridges/<id>/        (直置き)
 *   - cartridges/_local/<id>/ (junction 含むローカル開発用)
 *   - cartridges/_installed/<id>/  (GitHub から fetch)
 * 各 <id>/routes だけを個別に watch することで、cartridges/ ルートに
 * recursive watch を仕掛けないようにする。Windows の fs.watch は
 * junction に対する recursive watch でハング・誤検知を起こすため、
 * これを避ける重要な対策。
 */
function listCartridgeRouteDirs(cartridgesRoot) {
  const result = []  // { cartridgeId, routesDir, relPathPrefix }
  const tryAdd = (id, routesDir, relPathPrefix) => {
    try {
      if (existsSync(routesDir) && statSync(routesDir).isDirectory()) {
        result.push({ cartridgeId: id, routesDir, relPathPrefix })
      }
    } catch { /* */ }
  }
  const scanDir = (subdir, prefix) => {
    const dir = subdir ? join(cartridgesRoot, subdir) : cartridgesRoot
    let names
    try { names = readdirSync(dir) } catch { return }
    for (const name of names) {
      if (!subdir && (name.startsWith('_') || name.startsWith('.'))) continue
      if (subdir && (name.startsWith('.') )) continue
      const cartDir = join(dir, name)
      try { if (!statSync(cartDir).isDirectory()) continue } catch { continue }
      tryAdd(name, join(cartDir, 'routes'), prefix ? `${prefix}/${name}` : name)
    }
  }
  scanDir(null, '')
  scanDir('_local', '_local')
  scanDir('_installed', '_installed')
  return result
}

function startCartridgeWatcher() {
  const cartridgesRoot = resolveCartridgesRoot()
  if (!existsSync(cartridgesRoot)) {
    console.log('[auto-sync] カートリッジ置き場がありません:', cartridgesRoot)
    return
  }
  console.log('[auto-sync] 👀 監視開始:', cartridgesRoot)

  const pending = new Map()
  const DEBOUNCE_MS = 150
  cartridgeWatcher = []

  const targets = listCartridgeRouteDirs(cartridgesRoot)
  if (targets.length === 0) {
    console.log('[auto-sync] watch 対象のカートリッジなし')
    return
  }

  for (const { cartridgeId, routesDir, relPathPrefix } of targets) {
    try {
      const w = watch(routesDir, { recursive: true }, (_event, filename) => {
        if (!filename) return
        // routesDir を起点とする相対パス → cartridges/ ルートからの相対パスに変換
        const relFromRoot = `${relPathPrefix}/routes/${filename.replace(/\\/g, '/')}`
        if (pending.has(relFromRoot)) clearTimeout(pending.get(relFromRoot))
        pending.set(relFromRoot, setTimeout(() => {
          pending.delete(relFromRoot)
          syncFile(cartridgesRoot, relFromRoot)
        }, DEBOUNCE_MS))
      })
      w.on('error', (err) => {
        console.error(`[auto-sync] watcher error (${cartridgeId}):`, err.message)
      })
      cartridgeWatcher.push(w)
      console.log(`[auto-sync]   ▸ ${relPathPrefix}/routes/`)
    } catch (e) {
      console.error(`[auto-sync] watcher 起動失敗 (${cartridgeId}):`, e.message)
    }
  }
}

function stopCartridgeWatcher() {
  if (Array.isArray(cartridgeWatcher)) {
    for (const w of cartridgeWatcher) {
      try { w.close() } catch { /* */ }
    }
    cartridgeWatcher = null
  } else if (cartridgeWatcher) {
    try { cartridgeWatcher.close() } catch { /* */ }
    cartridgeWatcher = null
  }
}

function poll() {
  if (shuttingDown) return
  try {
    if (existsSync(FLAG_FILE)) {
      const m = statSync(FLAG_FILE).mtimeMs
      if (m > lastFlagMTime) {
        lastFlagMTime = m
        performRestart()
      }
    }
  } catch { /* ignore */ }
  setTimeout(poll, 500)
}

async function shutdown(sig) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n[supervisor] ${sig} を受信、子プロセスを終了します...`)
  stopCartridgeWatcher()
  await killChild()
  process.exit(0)
}

process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// 起動時に古い flag が残っていれば消す
try { rmSync(FLAG_FILE, { force: true }) } catch { /* */ }

;(async () => {
  await spawnChild()
  startCartridgeWatcher()
  poll()
})()
