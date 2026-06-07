import { NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { getCartridge } from '@/lib/cartridge-scanner'

/**
 * カートリッジのデプロイ関連情報を返す。
 *
 * - 最後にカートリッジを変更した local commit
 * - リモート（origin/main）と比較した未 push commit 数
 * - 作業ツリーの未コミット変更
 * - GitHub URL（origin から構築）
 *
 * sibling repo (cart-* リポを junction で参照) 対応:
 *   1. cartridge-scanner で junction を解決した実体パスを取得
 *   2. git rev-parse --show-toplevel で実体パスの所属する git repo ルートを特定
 *   3. cart-* のような独立リポなら、その repo の git 情報を読む
 *   4. Studio 直下に置かれている旧式カートリッジは Studio リポの git を読む
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  // scanner 経由でカートリッジ実体パスを取得 (junction 解決済み)
  const entry = getCartridge(safe)
  if (!entry || !existsSync(entry.path)) {
    return NextResponse.json({ error: 'カートリッジが見つかりません' }, { status: 404 })
  }

  const cartDir = entry.path

  // git の repo ルートを特定 (cart-* なら cart-*/, レガシーなら Studio/)
  const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: cartDir, encoding: 'utf-8' })
  const repoRoot = probe.status === 0 ? (probe.stdout || '').trim() : cartDir

  const git = (...args: string[]): string => {
    const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf-8' })
    if (r.status !== 0) return ''
    return (r.stdout || '').trim()
  }

  // repo ルートからの相対パス
  const cartAbs = cartDir.replace(/\\/g, '/')
  const rootAbs = repoRoot.replace(/\\/g, '/')
  const isSiblingRepo = cartAbs === rootAbs
  // sibling: 全体を参照 / レガシー: cartridges/<id>/ サブパスのみ参照
  const cartridgePathRel = isSiblingRepo
    ? '.'
    : cartAbs.startsWith(rootAbs + '/')
      ? cartAbs.slice(rootAbs.length + 1)
      : `cartridges/${safe}`

  // 最後の local commit (sibling なら repo 全体の HEAD、レガシーなら該当 path の last commit)
  const lastLocal = isSiblingRepo
    ? git('log', '-1', '--format=%H%n%h%n%ci%n%an%n%s')
    : git('log', '-1', '--format=%H%n%h%n%ci%n%an%n%s', '--', cartridgePathRel)
  const [fullSha, shortSha, date, author, subject] = lastLocal.split('\n')

  // 全 commit 数 (sibling のみ。初期 scaffold だけなら 1)
  const commitCountStr = isSiblingRepo ? git('rev-list', '--count', 'HEAD') : ''
  const commitCount = commitCountStr ? Number(commitCountStr) : null

  // remote ブランチ参照を解決 (origin/main, origin/HEAD 等)
  const remoteRef = (() => {
    if (git('rev-parse', '--verify', 'origin/main')) return 'origin/main'
    if (git('rev-parse', '--verify', 'origin/HEAD')) return 'origin/HEAD'
    return null
  })()

  // 未 push commit 数
  let unpushedCount = 0
  if (remoteRef) {
    const unpushed = isSiblingRepo
      ? git('log', `${remoteRef}..HEAD`, '--oneline')
      : git('log', `${remoteRef}..HEAD`, '--oneline', '--', cartridgePathRel)
    unpushedCount = unpushed ? unpushed.split('\n').filter(Boolean).length : 0
  } else if (fullSha) {
    // remote が未設定 = まだ push されていない可能性 → 全 commit が未 push 扱い
    unpushedCount = commitCount ?? 0
  }

  // 作業ツリーの未コミット変更
  const dirty = isSiblingRepo
    ? git('status', '--porcelain')
    : git('status', '--porcelain', '--', cartridgePathRel)
  const dirtyFiles = dirty ? dirty.split('\n').filter(Boolean) : []

  // 現在のブランチ
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || 'main'

  // 本番 sha と比較するための HEAD commit
  const repoHead = git('rev-parse', 'HEAD') || ''

  // origin URL → GitHub Web URL
  const originRaw = git('config', '--get', 'remote.origin.url')
  const githubBase = toGithubBaseUrl(originRaw)
  const githubFolderUrl = githubBase
    ? (isSiblingRepo ? `${githubBase}/tree/${branch}` : `${githubBase}/tree/${branch}/${cartridgePathRel}`)
    : null
  const githubCommitUrl = githubBase && fullSha
    ? `${githubBase}/commit/${fullSha}`
    : null

  return NextResponse.json({
    appId:           safe,
    branch,
    cartridgePath:   cartridgePathRel,
    repoHead,
    lastCommit:      fullSha
      ? { fullSha, shortSha, date, author, subject }
      : null,
    commitCount,                          // 新規追加: sibling repo の総 commit 数 (初期 scaffold 判定用)
    unpushedCount,
    dirtyFiles,
    isSiblingRepo,                        // 新規追加: cart-* のような独立 git repo か
    hasRemote:       remoteRef !== null,  // 新規追加: origin remote の有無
    github: githubBase ? {
      base:      githubBase,
      folderUrl: githubFolderUrl,
      commitUrl: githubCommitUrl,
    } : null,
    production: {
      baseUrl:     process.env.STUDIO_PRODUCTION_URL ?? 'https://appharbor.vercel.app',
      platformUrl: (process.env.STUDIO_PRODUCTION_URL ?? 'https://appharbor.vercel.app').replace(/\/$/, '') + `/platform/apps/${safe}`,
    },
  })
}

/** git の origin URL を https://github.com/owner/repo 形式に変換 */
function toGithubBaseUrl(originUrl: string): string | null {
  if (!originUrl) return null
  // git@github.com:owner/repo.git
  const sshMatch = originUrl.match(/^git@github\.com:([^/]+)\/([^.]+?)(?:\.git)?$/)
  if (sshMatch) return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`
  // https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = originUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?\/?$/)
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`
  return null
}
