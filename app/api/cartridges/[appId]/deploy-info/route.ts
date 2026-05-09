import { NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { resolveCartridgesPath } from '@/lib/config'

/**
 * カートリッジのデプロイ関連情報を返す。
 *
 *  - 最後にカートリッジを変更した local commit
 *  - リモート（origin/main）と比較した未 push commit 数
 *  - 作業ツリーの未コミット変更（このカートリッジ配下）
 *  - GitHub URL（origin から構築）
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')
  const root = resolveCartridgesPath()
  const cartDir = join(root, safe)

  // git の repo ルートを特定（cartridge dir から rev-parse で逆引き）
  const probeCwd = existsSync(cartDir) ? cartDir : root
  const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: probeCwd, encoding: 'utf-8' })
  const repoRoot = probe.status === 0 ? (probe.stdout || '').trim() : probeCwd

  const git = (...args: string[]): string => {
    const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf-8' })
    if (r.status !== 0) return ''
    return (r.stdout || '').trim()
  }

  // repo ルートからの相対パスを構築（resolveCartridgesPath が repo 外を指す場合も考慮）
  const cartAbs = cartDir.replace(/\\/g, '/')
  const rootAbs = repoRoot.replace(/\\/g, '/')
  const cartridgePathRel = cartAbs.startsWith(rootAbs + '/')
    ? cartAbs.slice(rootAbs.length + 1)
    : `cartridges/${safe}`

  // 最後にこのカートリッジを変更した local commit
  const lastLocal = git('log', '-1', '--format=%H%n%h%n%ci%n%an%n%s', '--', cartridgePathRel)
  const [fullSha, shortSha, date, author, subject] = lastLocal.split('\n')

  // 未 push commit 数（origin/main..HEAD の中で cartridge を触ったもの）
  const unpushed = git('log', 'origin/main..HEAD', '--oneline', '--', cartridgePathRel)
  const unpushedCount = unpushed ? unpushed.split('\n').filter(Boolean).length : 0

  // 作業ツリーの未コミット変更
  const dirty = git('status', '--porcelain', '--', cartridgePathRel)
  const dirtyFiles = dirty ? dirty.split('\n').filter(Boolean) : []

  // 現在のブランチ
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || 'main'

  // リポジトリ全体の HEAD commit（カートリッジ非依存・本番 sha との比較に使う）
  const repoHead = git('rev-parse', 'HEAD') || ''

  // origin URL を GitHub Web URL に変換
  const originRaw = git('config', '--get', 'remote.origin.url')
  const githubBase = toGithubBaseUrl(originRaw)
  const githubFolderUrl = githubBase
    ? `${githubBase}/tree/${branch}/${cartridgePathRel}`
    : null
  const githubCommitUrl = githubBase && fullSha
    ? `${githubBase}/commit/${fullSha}`
    : null

  return NextResponse.json({
    appId: safe,
    branch,
    cartridgePath: cartridgePathRel,
    repoHead,
    lastCommit: fullSha
      ? { fullSha, shortSha, date, author, subject }
      : null,
    unpushedCount,
    dirtyFiles,
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
