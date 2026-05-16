/**
 * Docker Supabase の自動セットアップ。
 *
 * Stage 2 移行ボタン押下時に実行され、ユーザーが手動でやっていた次を肩代わりする:
 *   1. supabase プロジェクトディレクトリの自動検出
 *   2. config.toml の studio スキーマ公開設定の確認 + 適用
 *   3. `supabase status` から sb_secret_xxx 等のキー取得
 *   4. Studio の .env.local に DOCKER_SUPABASE_URL / KEY を書き込み
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { execSync } from 'child_process'

export type SetupResult = {
  ok: boolean
  steps: SetupStep[]
  /** 全工程が完了した後ユーザーがやるべき残作業 */
  followUps: string[]
}

export type SetupStep = {
  name:    string
  status:  'ok' | 'warn' | 'error' | 'skipped'
  detail:  string
}

const STUDIO_ROOT = resolve(process.cwd())
const ENV_LOCAL   = join(STUDIO_ROOT, '.env.local')

/* ── supabase プロジェクト検出 ────────────────────────── */

/**
 * supabase/config.toml が存在するディレクトリを検出する。
 *  - 環境変数 SUPABASE_PROJECT_DIR を最優先
 *  - 次に Studio の親階層 (../*\/supabase/config.toml) を探索
 *  - 見つからなければ null
 */
export function findSupabaseProjectDir(): string | null {
  const fromEnv = process.env.SUPABASE_PROJECT_DIR
  if (fromEnv && existsSync(join(fromEnv, 'supabase', 'config.toml'))) {
    return fromEnv
  }

  // Studio の親ディレクトリ配下の sibling プロジェクトを総当たり (浅く)
  const studioParent = dirname(STUDIO_ROOT)
  try {
    for (const name of readdirSync(studioParent)) {
      const dir = join(studioParent, name)
      try {
        if (!statSync(dir).isDirectory()) continue
      } catch { continue }
      if (existsSync(join(dir, 'supabase', 'config.toml'))) return dir
    }
  } catch { /* ignore */ }

  return null
}

/* ── config.toml の studio スキーマ公開 ──────────────── */

/**
 * `[api]` セクションの schemas 配列に "studio" を追加する。
 * 既に含まれていれば何もしない。冪等。
 *
 * 戻り値: 変更したか否か
 */
export function ensureStudioInSchemas(projectDir: string): { changed: boolean; before: string | null; after: string | null } {
  const configPath = join(projectDir, 'supabase', 'config.toml')
  if (!existsSync(configPath)) {
    return { changed: false, before: null, after: null }
  }

  const text  = readFileSync(configPath, 'utf-8')
  const lines = text.split(/\r?\n/)

  // [api] セクション内の schemas 行を探す
  let inApi = false
  let schemasIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (l.startsWith('[') && l.endsWith(']')) {
      inApi = (l === '[api]')
      continue
    }
    if (inApi && /^schemas\s*=/.test(l)) {
      schemasIdx = i
      break
    }
  }

  if (schemasIdx < 0) return { changed: false, before: null, after: null }

  const before = lines[schemasIdx]
  if (/"studio"/.test(before)) {
    return { changed: false, before, after: before }
  }

  // schemas = [...] の中に "studio" を追加 (末尾 ] の前に挿入)
  // 例: schemas = ["public", "graphql_public"]
  //   → schemas = ["public", "graphql_public", "studio"]
  const after = before.replace(/\]\s*(#.*)?$/, (_match, comment) => {
    return `, "studio"]${comment ? ' ' + comment : ''}`
  })
  if (after === before) {
    return { changed: false, before, after }
  }

  lines[schemasIdx] = after
  writeFileSync(configPath, lines.join('\n'), 'utf-8')
  return { changed: true, before, after }
}

/* ── supabase status からキー取得 ────────────────────── */

export type SupabaseKeys = {
  apiUrl:     string | null
  /** v2 形式 (sb_secret_xxx) を優先、なければ legacy JWT */
  serviceKey: string | null
}

/**
 * `npx supabase status` を実行して接続情報を取得する。
 */
export function extractSupabaseKeys(projectDir: string): SupabaseKeys {
  let output: string
  try {
    output = execSync('npx supabase status', {
      cwd:      projectDir,
      encoding: 'utf-8',
      stdio:    ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    // 失敗時は stderr に出力されているかも
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string }
    output = ((err.stdout ?? '') + (err.stderr ?? '')).toString()
  }

  // テーブル形式の出力から値を抽出
  const m = (pattern: RegExp): string | null => {
    const x = output.match(pattern)
    return x ? x[1].trim() : null
  }

  const apiUrl = m(/(?:API URL|Project URL)\s*│\s*([^\s│]+)/)

  // 新形式 (sb_secret_) 優先、無ければ legacy
  const secret = m(/Secret\s*│\s*(sb_secret_[A-Za-z0-9_-]+)/)
  const legacy = m(/service_role(?:\s*key)?\s*│\s*([A-Za-z0-9_.-]+)/)

  return {
    apiUrl,
    serviceKey: secret ?? legacy,
  }
}

/* ── .env.local 書き込み ────────────────────────────── */

/**
 * .env.local の DOCKER_SUPABASE_URL / DOCKER_SUPABASE_SERVICE_ROLE_KEY を更新する。
 * 既存の他の値は保持する。
 */
export function writeDockerEnv(keys: SupabaseKeys): { changed: boolean } {
  const lines: string[] = []
  let existing: Record<string, string> = {}

  if (existsSync(ENV_LOCAL)) {
    const text = readFileSync(ENV_LOCAL, 'utf-8')
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) {
        lines.push(raw)
        continue
      }
      const eq = line.indexOf('=')
      if (eq < 0) { lines.push(raw); continue }
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim()
      existing[k] = v
      lines.push(raw)
    }
  }

  const target: Record<string, string | null> = {
    DOCKER_SUPABASE_URL:               keys.apiUrl,
    DOCKER_SUPABASE_SERVICE_ROLE_KEY:  keys.serviceKey,
  }

  let changed = false
  const finalLines: string[] = []
  const handled = new Set<string>()

  // 既存行を保持しつつ更新対象を上書き
  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      finalLines.push(raw)
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq < 0) { finalLines.push(raw); continue }
    const k = trimmed.slice(0, eq).trim()
    if (k in target) {
      handled.add(k)
      const newVal = target[k]
      if (newVal && existing[k] !== newVal) {
        finalLines.push(`${k}=${newVal}`)
        changed = true
      } else {
        finalLines.push(raw)
      }
    } else {
      finalLines.push(raw)
    }
  }

  // 既存に無いキーを末尾に追加
  for (const [k, v] of Object.entries(target)) {
    if (!v || handled.has(k)) continue
    if (existing[k] === v) continue
    finalLines.push(`${k}=${v}`)
    changed = true
  }

  if (changed) {
    // ヘッダコメントを保持
    if (finalLines.length === 0 || !finalLines[0].startsWith('#')) {
      finalLines.unshift('# Docker Supabase (auto-generated by Stage 2 migrate)')
    }
    writeFileSync(ENV_LOCAL, finalLines.join('\n') + '\n', 'utf-8')
  }
  // suppress unused warning
  existing = existing

  return { changed }
}

/* ── 全部まとめて実行 ───────────────────────────────── */

export async function setupDockerSupabase(): Promise<SetupResult> {
  const steps: SetupStep[] = []
  const followUps: string[] = []

  // 1. supabase プロジェクト検出
  const projectDir = findSupabaseProjectDir()
  if (!projectDir) {
    steps.push({
      name:   'project',
      status: 'error',
      detail: 'supabase/config.toml が見つかりません。SUPABASE_PROJECT_DIR を設定してください',
    })
    return { ok: false, steps, followUps }
  }
  steps.push({
    name:   'project',
    status: 'ok',
    detail: projectDir,
  })

  // 2. config.toml の studio スキーマ公開
  try {
    const res = ensureStudioInSchemas(projectDir)
    if (res.changed) {
      steps.push({
        name:   'config.toml',
        status: 'warn',
        detail: `[api] schemas に "studio" を追加しました`,
      })
      followUps.push('supabase を再起動: `npx supabase stop && npx supabase start`')
    } else if (res.before === null) {
      steps.push({
        name:   'config.toml',
        status: 'error',
        detail: '[api] schemas 行が見つかりません',
      })
    } else {
      steps.push({
        name:   'config.toml',
        status: 'ok',
        detail: 'studio スキーマは既に公開されています',
      })
    }
  } catch (e) {
    steps.push({
      name:   'config.toml',
      status: 'error',
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // 3. supabase status からキー取得
  let keys: SupabaseKeys = { apiUrl: null, serviceKey: null }
  try {
    keys = extractSupabaseKeys(projectDir)
    if (keys.serviceKey) {
      steps.push({
        name:   'supabase-status',
        status: 'ok',
        detail: `Secret key 取得 (${keys.serviceKey.slice(0, 16)}...)`,
      })
    } else {
      steps.push({
        name:   'supabase-status',
        status: 'warn',
        detail: 'Secret key が取得できませんでした (supabase が停止中?)',
      })
      followUps.push('supabase が起動しているか確認: `npx supabase status`')
    }
  } catch (e) {
    steps.push({
      name:   'supabase-status',
      status: 'error',
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // 4. .env.local 書き込み
  if (keys.serviceKey) {
    try {
      const res = writeDockerEnv(keys)
      steps.push({
        name:   '.env.local',
        status: res.changed ? 'warn' : 'ok',
        detail: res.changed
          ? 'DOCKER_SUPABASE_URL / KEY を更新しました'
          : '既に正しい値が設定されています',
      })
      if (res.changed) {
        followUps.push('Studio を再起動して環境変数を反映: `Ctrl+C → npm run start`')
      }
    } catch (e) {
      steps.push({
        name:   '.env.local',
        status: 'error',
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const ok = !steps.some(s => s.status === 'error')
  return { ok, steps, followUps }
}
