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
    const pinnedCommit = await resolveRefToCommit(token, targetRepo, pinnedRef)

    // 3. cart リポの main HEAD
    const { branch: cartBranch, sha: cartHead } = await getRepoDefaultBranchHead(token, cartridgeRepo)

    // 4. 比較
    const isNewer = pinnedCommit !== cartHead

    let changeKind: 'schema' | 'code' | 'none' = 'none'
    let aheadBy = 0
    let changedFiles: string[] = []

    if (isNewer) {
      // pinned → cartHead の間の変更ファイルを取得
      // Note: pinnedRef は AppHarbor リポのタグだが、cart リポの同名タグを指す
      try {
        const pinnedCommitInCart = await resolveRefToCommit(token, cartridgeRepo, pinnedRef)
        changedFiles = await getChangedFilesBetweenCommits(
          token, cartridgeRepo, pinnedCommitInCart, cartHead,
        )
        // aheadBy: compare API で取得
        const compareData = await fetchCompare(token, cartridgeRepo, pinnedCommitInCart, cartHead)
        aheadBy = compareData.aheadBy

        // changeKind 判定: db/schema.sql が変更されていれば schema
        const hasSchemaChange = changedFiles.some(f =>
          f === 'db/schema.sql' || f.startsWith('db/schema'),
        )
        changeKind = hasSchemaChange ? 'schema' : 'code'
      } catch {
        // tag が cart リポに無い場合など → code として扱う
        changeKind = 'code'
        aheadBy = -1 // unknown
      }
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
