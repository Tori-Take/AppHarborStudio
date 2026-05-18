import { NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'

const REGISTRY_PATH = resolve(process.cwd(), 'cartridges-registry.yaml')

type CheckItem = {
  id: string
  label: string
  ok: boolean
  detail: string
}

/**
 * Stage 4 の準備状況をチェックする。
 *
 * チェック項目:
 *   1. カートリッジが GitHub リポにあるか
 *   2. 最新コードが push されているか
 *   3. cartridges-registry.yaml にエントリがあるか
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json({ error: 'cartridge not found' }, { status: 404 })
  }

  const cartDir = entry.path
  const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: cartDir, encoding: 'utf-8' })
  const repoRoot = probe.status === 0 ? (probe.stdout || '').trim() : null

  const git = (...args: string[]): string => {
    if (!repoRoot) return ''
    const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf-8' })
    return r.status === 0 ? (r.stdout || '').trim() : ''
  }

  const checks: CheckItem[] = []

  // 1. GitHub リポの有無
  const originUrl = git('config', '--get', 'remote.origin.url')
  const githubMatch = originUrl.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/)
  const repoSlug = githubMatch ? `${githubMatch[1]}/${githubMatch[2]}` : null

  if (repoSlug) {
    checks.push({ id: 'github', label: 'GitHub リポジトリ', ok: true, detail: repoSlug })
  } else if (originUrl) {
    checks.push({ id: 'github', label: 'GitHub リポジトリ', ok: false, detail: `origin は設定済みだが GitHub ではない: ${originUrl}` })
  } else {
    checks.push({ id: 'github', label: 'GitHub リポジトリ', ok: false, detail: 'git remote origin が未設定。GitHub にリポジトリを作成して push してください。' })
  }

  // 2. push 済みか
  const remoteRef = git('rev-parse', '--verify', 'origin/main') ? 'origin/main'
    : git('rev-parse', '--verify', 'origin/HEAD') ? 'origin/HEAD'
    : null

  if (remoteRef) {
    const unpushed = git('log', `${remoteRef}..HEAD`, '--oneline')
    const dirty = git('status', '--porcelain')
    const unpushedCount = unpushed ? unpushed.split('\n').filter(Boolean).length : 0
    const IGNORE_PATTERNS = [/^\?\?\s+\.claude\//]
    const dirtyLines = dirty ? dirty.split('\n').filter(Boolean).filter(l => !IGNORE_PATTERNS.some(p => p.test(l))) : []
    const dirtyCount = dirtyLines.length

    if (unpushedCount === 0 && dirtyCount === 0) {
      checks.push({ id: 'pushed', label: '最新コードが push 済み', ok: true, detail: 'ローカルとリモートは同期しています' })
    } else {
      const parts: string[] = []
      if (dirtyCount > 0) parts.push(`未コミット ${dirtyCount} 件`)
      if (unpushedCount > 0) parts.push(`未 push ${unpushedCount} commit`)
      checks.push({ id: 'pushed', label: '最新コードが push 済み', ok: false, detail: parts.join(' / ') + '。デプロイ情報パネルから push してください。' })
    }
  } else {
    checks.push({ id: 'pushed', label: '最新コードが push 済み', ok: false, detail: 'remote が未設定 — まだ一度も push されていません' })
  }

  // 3. registry エントリの有無
  const registryEntry = findRegistryEntry(safe)
  if (registryEntry) {
    checks.push({ id: 'registry', label: 'Registry に登録済み', ok: true, detail: `mode: ${registryEntry.mode}` + (registryEntry.repo ? `, repo: ${registryEntry.repo}` : '') })
  } else {
    checks.push({ id: 'registry', label: 'Registry に登録済み', ok: false, detail: 'cartridges-registry.yaml にエントリがありません' })
  }

  // registry エントリのスニペットを生成
  const snippet = repoSlug
    ? `  - id: ${safe}\n    repo: ${repoSlug}\n    ref: main\n    mode: installed\n    enabled: true`
    : `  - id: ${safe}\n    repo: YOUR_GITHUB_USER/${safe}\n    ref: main\n    mode: installed\n    enabled: true`

  const allOk = checks.every(c => c.ok)

  return NextResponse.json({ checks, allOk, snippet, repoSlug })
}

/**
 * registry にエントリを追加する。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  let body: { repo?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  // 既にあるか確認
  const existing = findRegistryEntry(safe)
  if (existing) {
    return NextResponse.json({ ok: true, action: 'already_exists', detail: '既に登録済みです' })
  }

  // repo slug を取得
  const entry = getCartridge(safe)
  let repoSlug = body.repo ?? null
  if (!repoSlug && entry) {
    const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: entry.path, encoding: 'utf-8' })
    const repoRoot = probe.status === 0 ? (probe.stdout || '').trim() : null
    if (repoRoot) {
      const originUrl = spawnSync('git', ['config', '--get', 'remote.origin.url'], { cwd: repoRoot, encoding: 'utf-8' })
      const url = (originUrl.stdout || '').trim()
      const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/)
      if (m) repoSlug = `${m[1]}/${m[2]}`
    }
  }

  if (!repoSlug) {
    return NextResponse.json({ ok: false, error: 'GitHub リポの情報が取得できません。repo パラメータを指定してください。' }, { status: 400 })
  }

  // registry に追加
  const newEntry = `\n  - id: ${safe}\n    repo: ${repoSlug}\n    ref: main\n    mode: installed\n    enabled: true\n`

  if (!existsSync(REGISTRY_PATH)) {
    return NextResponse.json({ ok: false, error: 'cartridges-registry.yaml が見つかりません' }, { status: 500 })
  }

  const content = readFileSync(REGISTRY_PATH, 'utf-8')
  writeFileSync(REGISTRY_PATH, content.trimEnd() + '\n' + newEntry, 'utf-8')

  return NextResponse.json({ ok: true, action: 'added', repo: repoSlug })
}

function findRegistryEntry(appId: string): { mode: string; repo?: string } | null {
  if (!existsSync(REGISTRY_PATH)) return null
  const text = readFileSync(REGISTRY_PATH, 'utf-8')

  let current: Record<string, string> | null = null
  let found: Record<string, string> | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trimEnd()
    if (!line.trim()) continue
    const m1 = line.match(/^\s+- id:\s*(.+)$/)
    if (m1) {
      if (current && current.id === appId) { found = current; break }
      current = { id: m1[1].trim() }
      continue
    }
    if (!current) continue
    const m2 = line.match(/^\s+(\w+):\s*(.+)$/)
    if (m2) current[m2[1]] = m2[2].trim()
  }
  if (!found && current && current.id === appId) found = current

  if (!found) return null
  return { mode: found.mode ?? 'unknown', repo: found.repo }
}
