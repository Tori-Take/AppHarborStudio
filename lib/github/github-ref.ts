/**
 * GitHub API でタグ/ブランチの解決、HEAD 取得、タグ作成を行うユーティリティ。
 *
 * 既存の cartridge-pr.ts の gh() ヘルパーと同じパターンで raw fetch を使う。
 */

const GH_API = 'https://api.github.com'

async function gh<T = unknown>(
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  endpoint: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${GH_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'AppHarborStudio',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub API ${method} ${endpoint} failed: ${res.status} ${res.statusText} — ${text.slice(0, 500)}`)
  }
  return res.json() as Promise<T>
}

/**
 * ref (tag or branch) をコミット SHA に解決する。
 * タグの場合は annotated tag → commit を辿る。
 */
export async function resolveRefToCommit(
  token: string,
  repo: string,
  ref: string,
): Promise<string> {
  // Try tag first, then branch
  for (const prefix of ['tags', 'heads']) {
    try {
      const data = await gh<{ object: { sha: string; type: string } }>(
        token, 'GET', `/repos/${repo}/git/ref/${prefix}/${ref}`,
      )
      let sha = data.object.sha
      // Annotated tag → need to dereference to the commit
      if (data.object.type === 'tag') {
        const tagObj = await gh<{ object: { sha: string } }>(
          token, 'GET', `/repos/${repo}/git/tags/${sha}`,
        )
        sha = tagObj.object.sha
      }
      return sha
    } catch {
      continue
    }
  }
  throw new Error(`ref "${ref}" not found in ${repo} (tried tags/ and heads/)`)
}

/**
 * リポのデフォルトブランチの HEAD コミット SHA を取得する。
 */
export async function getRepoDefaultBranchHead(
  token: string,
  repo: string,
): Promise<{ branch: string; sha: string }> {
  const repoData = await gh<{ default_branch: string }>(
    token, 'GET', `/repos/${repo}`,
  )
  const branch = repoData.default_branch
  const refData = await gh<{ object: { sha: string } }>(
    token, 'GET', `/repos/${repo}/git/ref/heads/${branch}`,
  )
  return { branch, sha: refData.object.sha }
}

/**
 * 2 つのコミット間の diff ファイル一覧を取得する。
 * changeKind 判定に使う。
 */
export async function getChangedFilesBetweenCommits(
  token: string,
  repo: string,
  baseSha: string,
  headSha: string,
): Promise<string[]> {
  const data = await gh<{ files?: Array<{ filename: string }> }>(
    token, 'GET', `/repos/${repo}/compare/${baseSha}...${headSha}`,
  )
  return (data.files ?? []).map(f => f.filename)
}

/**
 * リポの既存タグ名一覧を取得する（100件まで。それで十分）。
 */
export async function listTags(
  token: string,
  repo: string,
): Promise<string[]> {
  const tags = await gh<Array<{ name: string }>>(
    token, 'GET', `/repos/${repo}/tags?per_page=100`,
  )
  return tags.map(t => t.name)
}

/**
 * lightweight tag を作成する。
 */
export async function createTag(
  token: string,
  repo: string,
  tagName: string,
  commitSha: string,
): Promise<void> {
  await gh(
    token, 'POST', `/repos/${repo}/git/refs`,
    { ref: `refs/tags/${tagName}`, sha: commitSha },
  )
}

// ---------- Pure functions (testable without API) ----------

/**
 * 次のタグ名を決定する。
 *
 * ルール:
 *   1. manifestVersion > pinnedRef (semver比較) → v{manifestVersion} をそのまま使う
 *   2. manifestVersion <= pinnedRef → pinnedRef の patch+1
 *   3. 算出したタグが existingTags に含まれていたら更にインクリメント
 *
 * @param manifestVersion manifest.json の version (例: "0.2.0" or "v0.2.0")
 * @param pinnedRef 現在の pinned ref (例: "v0.1.1")
 * @param existingTags リポに既存のタグ名一覧
 * @returns "v0.2.0" のような v-prefix 付きタグ名
 */
export function nextTag(
  manifestVersion: string,
  pinnedRef: string,
  existingTags: string[],
): string {
  const mVer = parseSemver(manifestVersion)
  const pVer = parseSemver(pinnedRef)

  let candidate: [number, number, number]
  if (compareSemver(mVer, pVer) > 0) {
    candidate = mVer
  } else {
    candidate = [pVer[0], pVer[1], pVer[2] + 1]
  }

  const tagSet = new Set(existingTags)
  while (tagSet.has(`v${candidate[0]}.${candidate[1]}.${candidate[2]}`)) {
    candidate[2]++
  }

  return `v${candidate[0]}.${candidate[1]}.${candidate[2]}`
}

function parseSemver(version: string): [number, number, number] {
  const cleaned = version.replace(/^v/, '')
  const parts = cleaned.split('.').map(Number)
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}
