import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'
import { getRegistryRef } from '@/lib/github/registry-yaml'
import {
  resolveRefToCommit,
  getRepoDefaultBranchHead,
  getChangedFilesBetweenCommits,
} from '@/lib/github/github-ref'
import { matchesCartReleaseBranch } from '@/lib/github/cartridge-pr'

/**
 * AppHarbor の pinned ref と cart の GitHub main HEAD を比較する。
 *
 * レスポンス:
 *   - pinnedRef: registry に記載されている ref (例: "v0.1.1")
 *   - pinnedCommit: pinned ref が指すコミット SHA
 *   - cartHead: cart リポの main HEAD コミット SHA
 *   - isNewer: cart が pinned より先に進んでいるか
 *   - changeKind: "schema" | "code" | "none"
 *   - aheadBy: 先行コミット数（compare API から取得）
 *   - isPinnedTag: pinned が固定タグ運用か (ref !== "main")
 *   - error: エラー時のメッセージ
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'GITHUB_TOKEN not set', isNewer: false },
      { status: 400 },
    )
  }

  const targetRepo = process.env.APPHARBOR_TARGET_REPO ?? 'Tori-Take/appharbor'
  const targetBranch = process.env.APPHARBOR_TARGET_BRANCH ?? 'main'

  // cartridge 情報を取得
  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json(
      { error: `cartridge ${safe} not found`, isNewer: false },
      { status: 404 },
    )
  }

  // cart リポの slug を Studio の registry から取得
  const cartridgeRepo = findCartridgeRepo(safe)
  if (!cartridgeRepo) {
    return NextResponse.json(
      { error: `cartridge repo not found in Studio registry for: ${safe}`, isNewer: false },
      { status: 400 },
    )
  }

  try {
    // 1. AppHarbor registry から pinned ref を取得 (GitHub API 経由)
    const registryContent = await fetchRegistryContent(token, targetRepo, targetBranch)
    const pinnedRef = getRegistryRef(registryContent, safe)

    if (!pinnedRef) {
      return NextResponse.json({
        isNewer: false,
        notRegistered: true,
        message: `${safe} is not registered in AppHarbor. Use initial install flow.`,
      })
    }

    const isPinnedTag = pinnedRef !== 'main'

    if (!isPinnedTag) {
      return NextResponse.json({
        isNewer: false,
        pinnedRef,
        isPinnedTag: false,
        message: 'This cartridge uses ref: main (auto-fetch). Switch to pinned-tag operation to use bump PRs.',
      })
    }

    // 2. pinned ref → コミット SHA
    // pinnedRef (registry の ref) は **cart リポのタグ** を指す
    // (fetch-cartridges が `git clone --branch <ref> <cartRepo>` する単位)。
    // AppHarbor リポ側にこのタグは存在しないので cart リポで解決する。
    const pinnedCommit = await resolveRefToCommit(token, cartridgeRepo, pinnedRef)

    // 3. cart リポの main HEAD
    const { branch: cartBranch, sha: cartHead } = await getRepoDefaultBranchHead(token, cartridgeRepo)

    // 4. 比較
    const isNewer = pinnedCommit !== cartHead

    let changeKind: 'schema' | 'code' | 'none' = 'none'
    let aheadBy = 0
    let changedFiles: string[] = []
    // 新旧比較の表示用（isNewer のときだけ埋める。取得失敗は null）
    let pinnedVersion: string | null = null
    let pinnedCommitDate: string | null = null
    let cartHeadDate: string | null = null
    let openPr: { url: string; number: number } | null = null

    if (isNewer) {
      // pinned → cartHead の間の変更ファイルを取得
      try {
        changedFiles = await getChangedFilesBetweenCommits(
          token, cartridgeRepo, pinnedCommit, cartHead,
        )
        // aheadBy: compare API で取得
        const compareData = await fetchCompare(token, cartridgeRepo, pinnedCommit, cartHead)
        aheadBy = compareData.aheadBy

        // changeKind 判定: db/schema.sql が変更されていれば schema。
        // db/schema.released.sql (diff の基準ファイル) は本番スキーマではないので除外。
        const hasSchemaChange = changedFiles.includes('db/schema.sql')
        changeKind = hasSchemaChange ? 'schema' : 'code'
      } catch {
        // tag が cart リポに無い場合など → code として扱う
        changeKind = 'code'
        aheadBy = -1 // unknown
      }

      // 新旧比較メタ（best-effort。各ヘルパーは失敗時 null を返す）
      pinnedVersion = await fetchManifestVersionAtRef(token, cartridgeRepo, pinnedRef)
      pinnedCommitDate = await fetchCommitDate(token, cartridgeRepo, pinnedCommit)
      cartHeadDate = await fetchCommitDate(token, cartridgeRepo, cartHead)
      openPr = await findOpenReleasePr(token, targetRepo, safe)
    }

    // schema 変更時の追加情報: schema.released.sql の有無
    const schemaReleasedPath = join(entry.path, 'db', 'schema.released.sql')
    const hasSchemaReleased = existsSync(schemaReleasedPath)

    return NextResponse.json({
      pinnedRef,
      pinnedCommit,
      cartHead,
      cartBranch,
      cartridgeRepo,
      isNewer,
      isPinnedTag: true,
      changeKind,
      aheadBy,
      changedFiles,
      hasSchemaReleased,
      manifestVersion: (entry.manifest?.version as string | undefined) ?? null,
      pinnedVersion,
      pinnedCommitDate,
      cartHeadDate,
      openPr,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: msg, isNewer: false },
      { status: 500 },
    )
  }
}

// --- helpers ---

const REGISTRY_PATH = join(process.cwd(), 'cartridges-registry.yaml')

function findCartridgeRepo(cartridgeId: string): string | null {
  if (!existsSync(REGISTRY_PATH)) return null
  const text = readFileSync(REGISTRY_PATH, 'utf-8')
  let currentId: string | null = null
  let currentRepo: string | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trimEnd()
    if (!line.trim()) continue
    const idMatch = line.match(/^\s+- id:\s*(.+)$/)
    if (idMatch) {
      if (currentId === cartridgeId && currentRepo) return currentRepo
      currentId = idMatch[1].trim()
      currentRepo = null
      continue
    }
    const repoMatch = line.match(/^\s+repo:\s*(.+)$/)
    if (repoMatch) currentRepo = repoMatch[1].trim()
  }
  if (currentId === cartridgeId && currentRepo) return currentRepo
  return null
}

async function fetchRegistryContent(
  token: string,
  repo: string,
  ref: string,
): Promise<string> {
  const GH_API = 'https://api.github.com'
  const res = await fetch(
    `${GH_API}/repos/${repo}/contents/cartridges-registry.yaml?ref=${ref}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'AppHarborStudio',
      },
    },
  )
  if (!res.ok) throw new Error(`Failed to fetch registry: ${res.status}`)
  const data = (await res.json()) as { content: string; encoding: string }
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

async function fetchCompare(
  token: string,
  repo: string,
  base: string,
  head: string,
): Promise<{ aheadBy: number }> {
  const GH_API = 'https://api.github.com'
  const res = await fetch(
    `${GH_API}/repos/${repo}/compare/${base}...${head}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'AppHarborStudio',
      },
    },
  )
  if (!res.ok) return { aheadBy: -1 }
  const data = (await res.json()) as { ahead_by?: number }
  return { aheadBy: data.ahead_by ?? 0 }
}

/** 指定 ref 時点の cart manifest.json の version を取得（失敗時 null） */
async function fetchManifestVersionAtRef(
  token: string,
  repo: string,
  ref: string,
): Promise<string | null> {
  try {
    const GH_API = 'https://api.github.com'
    const res = await fetch(
      `${GH_API}/repos/${repo}/contents/manifest.json?ref=${encodeURIComponent(ref)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AppHarborStudio',
        },
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { content: string }
    const json = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')) as { version?: unknown }
    return typeof json.version === 'string' ? json.version : null
  } catch {
    return null
  }
}

/** コミットの日時 (committer date, ISO) を取得（失敗時 null） */
async function fetchCommitDate(
  token: string,
  repo: string,
  sha: string,
): Promise<string | null> {
  try {
    const GH_API = 'https://api.github.com'
    const res = await fetch(
      `${GH_API}/repos/${repo}/git/commits/${sha}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AppHarborStudio',
        },
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      committer?: { date?: string }
      author?: { date?: string }
    }
    return data.committer?.date ?? data.author?.date ?? null
  } catch {
    return null
  }
}

/** AppHarbor リポの open PR から、その cart の本番反映 PR を探す（best-effort・無ければ null） */
async function findOpenReleasePr(
  token: string,
  targetRepo: string,
  cartridgeId: string,
): Promise<{ url: string; number: number } | null> {
  try {
    const GH_API = 'https://api.github.com'
    const res = await fetch(
      `${GH_API}/repos/${targetRepo}/pulls?state=open&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AppHarborStudio',
        },
      },
    )
    if (!res.ok) return null
    const list = (await res.json()) as Array<{ number: number; html_url: string; head?: { ref?: string } }>
    const hit = list.find(p => p.head?.ref && matchesCartReleaseBranch(p.head.ref, cartridgeId))
    return hit ? { url: hit.html_url, number: hit.number } : null
  } catch {
    return null
  }
}
