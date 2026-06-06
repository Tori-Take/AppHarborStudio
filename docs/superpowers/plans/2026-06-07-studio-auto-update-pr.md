# Studio Stage 5: AppHarbor 更新検知 & 自動 bump PR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 5 が AppHarbor の pinned tag と cart の GitHub main HEAD を自動比較し、差分があればワンクリックで bump PR を作成できるようにする。

**Architecture:** 新 API `GET /api/cartridges/{id}/appharbor-status` で GitHub API 経由の比較を行い、結果を `PipelineSection.tsx` の Stage 5 セクションにバナー+ボタンとして表示する。ボタンクリックで既存 `POST install-to-appharbor` の拡張パス (`bumpRef: true`) を呼び、タグ採番→作成→registry ref bump→PR 作成までを一発実行する。

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, GitHub REST API (raw fetch, Octokit 不使用), 既存 `lib/github/cartridge-pr.ts` + `lib/schema-diff/`

**Target repo:** `C:\Users\torit\Desktop\Projects\AppHarbor-Studio`

**Note:** このプロジェクトにはテストフレームワーク (vitest/jest) が未導入。テストタスクではまず vitest をセットアップし、純粋関数の単体テストを書く。GitHub API を叩く関数は結合テスト対象だが、v1 ではスキップし手動検証で代替する。

---

## File Map

### 新規作成

| File | Responsibility |
|---|---|
| `lib/github/github-ref.ts` | GitHub API でのタグ/ブランチ→コミット SHA 解決、デフォルトブランチ HEAD 取得、タグ作成。GitHub API 操作の小さなユーティリティ群。 |
| `lib/github/registry-yaml.ts` | `cartridges-registry.yaml` の YAML テキストから特定 ID の `ref` 抽出・置換。純粋関数のみ（GitHub API 不使用）。 |
| `app/api/cartridges/[appId]/appharbor-status/route.ts` | 新 API エンドポイント。pinned ref vs cart HEAD の比較結果を返す。 |
| `lib/github/__tests__/registry-yaml.test.ts` | `registry-yaml.ts` の単体テスト。 |
| `lib/github/__tests__/github-ref.test.ts` | タグ採番ロジック (`nextTag`) の単体テスト。 |
| `vitest.config.ts` | vitest 設定ファイル（プロジェクト初のテストフレームワーク導入）。 |

### 変更

| File | What changes |
|---|---|
| `lib/github/cartridge-pr.ts` | `updateRegistryRef` 呼び出し対応、`bumpRef` モード分岐追加、タグ作成＋registry bump コミットの tree 構築。 |
| `app/api/cartridges/[appId]/install-to-appharbor/route.ts` | request body に `bumpRef` フラグ追加、bumpRef=true 時の処理フロー。 |
| `components/PipelineSection.tsx` | Stage 5 セクションに AppHarbor status バナー＋「更新 PR を作成」ボタン追加。 |
| `package.json` | `vitest` devDependency 追加、`"test"` script 追加。 |

---

## Task 1: vitest セットアップ

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: vitest をインストール**

```bash
cd C:\Users\torit\Desktop\Projects\AppHarbor-Studio
npm install -D vitest
```

- [ ] **Step 2: vitest.config.ts を作成**

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 3: package.json に test script を追加**

`package.json` の `"scripts"` セクションに追加:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 動作確認**

```bash
npm test
```

Expected: テストファイルがないので `No test files found` と出て正常終了 (exit 0)。

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

## Task 2: registry-yaml.ts — 純粋関数で YAML 操作

**Files:**
- Create: `lib/github/registry-yaml.ts`
- Create: `lib/github/__tests__/registry-yaml.test.ts`

- [ ] **Step 1: テストファイルを作成**

```ts
// lib/github/__tests__/registry-yaml.test.ts
import { describe, it, expect } from 'vitest'
import { getRegistryRef, updateRegistryRef } from '../registry-yaml'

const SAMPLE_YAML = `cartridges:
  - id: some-app
    repo: Owner/some-app
    ref: main
    mode: installed
    enabled: true

  - id: daigamen-test
    repo: Tori-Take/daigamen-test
    ref: v0.1.1
    mode: installed
    enabled: true

  - id: another-app
    repo: Owner/another-app
    ref: v2.0.0
    mode: installed
    enabled: true
`

describe('getRegistryRef', () => {
  it('extracts ref for a known cartridge', () => {
    expect(getRegistryRef(SAMPLE_YAML, 'daigamen-test')).toBe('v0.1.1')
  })

  it('extracts ref: main for another cartridge', () => {
    expect(getRegistryRef(SAMPLE_YAML, 'some-app')).toBe('main')
  })

  it('returns null for unknown cartridge', () => {
    expect(getRegistryRef(SAMPLE_YAML, 'nonexistent')).toBeNull()
  })

  it('handles id with special regex chars', () => {
    const yaml = `cartridges:
  - id: my.special+app
    repo: X/Y
    ref: v1.0.0
    mode: installed
    enabled: true
`
    expect(getRegistryRef(yaml, 'my.special+app')).toBe('v1.0.0')
  })
})

describe('updateRegistryRef', () => {
  it('updates ref for the target cartridge only', () => {
    const result = updateRegistryRef(SAMPLE_YAML, 'daigamen-test', 'v0.2.0')
    expect(getRegistryRef(result, 'daigamen-test')).toBe('v0.2.0')
    // other cartridges unchanged
    expect(getRegistryRef(result, 'some-app')).toBe('main')
    expect(getRegistryRef(result, 'another-app')).toBe('v2.0.0')
  })

  it('throws if cartridge not found', () => {
    expect(() => updateRegistryRef(SAMPLE_YAML, 'nonexistent', 'v1.0.0'))
      .toThrow('nonexistent')
  })

  it('preserves YAML structure (no rewriting unrelated lines)', () => {
    const result = updateRegistryRef(SAMPLE_YAML, 'daigamen-test', 'v0.2.0')
    // The line for some-app's ref should be untouched
    expect(result).toContain('    ref: main')
    // The line for daigamen-test should be updated
    expect(result).toContain('    ref: v0.2.0')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run lib/github/__tests__/registry-yaml.test.ts
```

Expected: FAIL — `Cannot find module '../registry-yaml'`

- [ ] **Step 3: registry-yaml.ts を実装**

```ts
// lib/github/registry-yaml.ts

/**
 * cartridges-registry.yaml のテキストから指定 ID の ref 値を取得する。
 * 純粋関数（GitHub API 不要）。
 *
 * YAML パーサを使わず行ベースで処理する（既存 cartridge-pr.ts と同じ方針）。
 */

/**
 * registry YAML 文字列から指定カートリッジの `ref` 値を抽出する。
 * 見つからなければ null。
 */
export function getRegistryRef(yaml: string, cartridgeId: string): string | null {
  const lines = yaml.split(/\r?\n/)
  let inTarget = false
  const escapedId = cartridgeId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const idRe = new RegExp(`^\\s+-\\s+id:\\s*${escapedId}\\s*$`)
  const anyIdRe = /^\s+-\s+id:\s*/
  const refRe = /^\s+ref:\s*(.+)$/

  for (const line of lines) {
    if (idRe.test(line)) {
      inTarget = true
      continue
    }
    if (inTarget) {
      // Hit next entry → stop
      if (anyIdRe.test(line)) return null
      const m = line.match(refRe)
      if (m) return m[1].trim()
    }
  }
  return null
}

/**
 * registry YAML 文字列の指定カートリッジの `ref` 行を newRef に置換した文字列を返す。
 * 他のカートリッジの行は一切変更しない。
 * 対象が見つからなければ throw する。
 */
export function updateRegistryRef(yaml: string, cartridgeId: string, newRef: string): string {
  const lines = yaml.split(/\r?\n/)
  let inTarget = false
  let found = false
  const escapedId = cartridgeId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const idRe = new RegExp(`^\\s+-\\s+id:\\s*${escapedId}\\s*$`)
  const anyIdRe = /^\s+-\s+id:\s*/
  const refRe = /^(\s+ref:\s*).+$/

  const result: string[] = []
  for (const line of lines) {
    if (idRe.test(line)) {
      inTarget = true
      result.push(line)
      continue
    }
    if (inTarget && anyIdRe.test(line)) {
      inTarget = false
    }
    if (inTarget) {
      const m = line.match(refRe)
      if (m) {
        result.push(`${m[1]}${newRef}`)
        found = true
        inTarget = false
        continue
      }
    }
    result.push(line)
  }

  if (!found) {
    throw new Error(`cartridge "${cartridgeId}" not found in registry YAML`)
  }
  return result.join('\n')
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run lib/github/__tests__/registry-yaml.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/github/registry-yaml.ts lib/github/__tests__/registry-yaml.test.ts
git commit -m "feat: add registry-yaml pure functions (getRegistryRef, updateRegistryRef)"
```

---

## Task 3: github-ref.ts — GitHub API ユーティリティ + タグ採番

**Files:**
- Create: `lib/github/github-ref.ts`
- Create: `lib/github/__tests__/github-ref.test.ts`

- [ ] **Step 1: テストファイルを作成（タグ採番ロジックのみ。API 関数はテスト対象外）**

```ts
// lib/github/__tests__/github-ref.test.ts
import { describe, it, expect } from 'vitest'
import { nextTag } from '../github-ref'

describe('nextTag', () => {
  it('uses manifest version if higher than pinned', () => {
    // manifest says 0.2.0, pinned is v0.1.1 → use v0.2.0
    expect(nextTag('0.2.0', 'v0.1.1', [])).toBe('v0.2.0')
  })

  it('bumps patch if manifest version equals pinned', () => {
    // manifest says 0.1.1, pinned is v0.1.1 → patch+1 → v0.1.2
    expect(nextTag('0.1.1', 'v0.1.1', [])).toBe('v0.1.2')
  })

  it('bumps patch if manifest version is lower than pinned', () => {
    // manifest says 0.1.0, pinned is v0.1.1 → patch+1 of pinned → v0.1.2
    expect(nextTag('0.1.0', 'v0.1.1', [])).toBe('v0.1.2')
  })

  it('skips existing tags when bumping', () => {
    // pinned v0.1.1, manifest 0.1.0, but v0.1.2 already exists → v0.1.3
    expect(nextTag('0.1.0', 'v0.1.1', ['v0.1.2'])).toBe('v0.1.3')
  })

  it('skips multiple existing tags', () => {
    expect(nextTag('0.1.0', 'v0.1.1', ['v0.1.2', 'v0.1.3'])).toBe('v0.1.4')
  })

  it('handles pinned without v prefix', () => {
    expect(nextTag('0.1.0', '0.1.1', [])).toBe('v0.1.2')
  })

  it('handles manifest with v prefix', () => {
    expect(nextTag('v0.2.0', 'v0.1.1', [])).toBe('v0.2.0')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run lib/github/__tests__/github-ref.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: github-ref.ts を実装**

```ts
// lib/github/github-ref.ts

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
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run lib/github/__tests__/github-ref.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/github/github-ref.ts lib/github/__tests__/github-ref.test.ts
git commit -m "feat: add github-ref utilities (resolveRefToCommit, nextTag, createTag)"
```

---

## Task 4: appharbor-status API エンドポイント

**Files:**
- Create: `app/api/cartridges/[appId]/appharbor-status/route.ts`

- [ ] **Step 1: route.ts を作成**

```ts
// app/api/cartridges/[appId]/appharbor-status/route.ts
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
```

- [ ] **Step 2: dev server で手動検証**

```bash
npm run dev
# ブラウザで http://localhost:3200/api/cartridges/daigamen-test/appharbor-status を開く
# GITHUB_TOKEN が .env.local にセットされていれば JSON レスポンスが返る
```

Expected: `isNewer: true/false` を含む JSON。`GITHUB_TOKEN` 未設定なら `error: "GITHUB_TOKEN not set"`。

- [ ] **Step 3: Commit**

```bash
git add app/api/cartridges/\[appId\]/appharbor-status/route.ts
git commit -m "feat: add GET /api/cartridges/{id}/appharbor-status endpoint"
```

---

## Task 5: install-to-appharbor 拡張 — bumpRef モード

**Files:**
- Modify: `app/api/cartridges/[appId]/install-to-appharbor/route.ts`
- Modify: `lib/github/cartridge-pr.ts`

- [ ] **Step 1: cartridge-pr.ts に updateRegistryRef 対応の import と bumpRef 用 options を追加**

`lib/github/cartridge-pr.ts` の先頭 import の下に追加:

```ts
import { getRegistryRef, updateRegistryRef } from './registry-yaml'
import { createTag, nextTag, listTags, resolveRefToCommit } from './github-ref'
```

`InstallPrOptions` 型に以下のフィールドを追加:

```ts
  /** bumpRef モード: タグ作成 + registry の ref bump のみ (migration は changeKind 次第) */
  bumpRef?: boolean
  /** bumpRef 時の新タグ名 (外部で決定済み) */
  newTag?: string
  /** bumpRef 時: migration SQL を含めるか (changeKind=schema の場合のみ true) */
  includeMigration?: boolean
```

`InstallMode` 型に `'ref-bump'` を追加:

```ts
export type InstallMode = 'files' | 'registry' | 'migration-only' | 'ref-bump'
```

- [ ] **Step 2: createCartridgeInstallPr に bumpRef 分岐を追加**

`createCartridgeInstallPr` 関数の mode 決定ロジック (line 219-228 付近) を以下に変更:

```ts
  // mode 決定
  let mode: InstallMode
  if (opts.bumpRef) {
    mode = 'ref-bump'
  } else if (isUpdate) {
    mode = 'migration-only'
  } else {
    const useRegistry = await targetHasRegistry(token, opts.targetRepo, targetBase)
    mode = useRegistry ? 'registry' : 'files'
  }
```

mode === 'ref-bump' の処理を、既存の `if (mode === 'registry')` ブロックの前に追加:

```ts
  if (mode === 'ref-bump') {
    // === ref-bump モード: registry の ref を新タグへ bump ===
    const cur = await gh<{ content: string; encoding: string; sha: string }>(
      token, 'GET', `/repos/${opts.targetRepo}/contents/cartridges-registry.yaml?ref=${targetBase}`,
    )
    const currentYaml = Buffer.from(cur.content, 'base64').toString('utf-8')
    const newYaml = updateRegistryRef(currentYaml, opts.cartridgeId, opts.newTag!)
    const newSha = await createBlob(token, opts.targetRepo, newYaml)
    treeEntries.push({
      path: 'cartridges-registry.yaml',
      mode: '100644',
      type: 'blob',
      sha: newSha,
    })
    filesProcessed = 1
  } else if (mode === 'registry') {
```

migration の追加部分 (line 281-289 付近) を条件付きに:

```ts
  // Migration SQL を tree に追加 (ref-bump で includeMigration=false なら skip)
  if (mode !== 'ref-bump' || opts.includeMigration) {
    const ts = new Date().toISOString().replace(/[-T:.]/g, '').slice(0, 14)
    const migrationFilename = `${ts}_cart_${opts.cartridgeId.replace(/-/g, '_')}_v${opts.schemaVersion}.sql`
    const migrationBlobSha = await createBlob(token, opts.targetRepo, opts.migrationSql)
    treeEntries.push({
      path: `supabase/migrations/${migrationFilename}`,
      mode: '100644',
      type: 'blob',
      sha: migrationBlobSha,
    })
  }
```

PR title/body を ref-bump モード対応に。commit message (line 309) の前に分岐を追加:

```ts
  const verbForCommit = mode === 'ref-bump'
    ? 'bump'
    : isUpdate ? 'update' : 'install'
```

PR body の `modeNote` に `ref-bump` 用メッセージを追加（既存 3 分岐の前に追加）:

```ts
  const modeNote =
    mode === 'ref-bump'
      ? `**ref bump モード**: \`cartridges-registry.yaml\` の \`${opts.cartridgeId}\` を \`ref: ${opts.newTag}\` に更新。` +
        (opts.includeMigration ? `\nスキーマ migration を同梱。` : `\nmigration なし (コード変更のみ)。`) +
        `\nマージ後の Vercel ビルドで新タグからカートリッジを自動取得します。`
      : mode === 'registry'
```

- [ ] **Step 3: install-to-appharbor/route.ts に bumpRef パスを追加**

`route.ts` の POST handler を拡張。request body から `bumpRef` フラグを受け取る。
既存の `const safe = ...` の後に body parse を追加:

```ts
  let reqBody: { bumpRef?: boolean; newTag?: string; changeKind?: string } = {}
  try {
    reqBody = await _req.json()
  } catch {
    // body が空でも OK (既存の初回/update フローは body 不要)
  }
```

`installMode` 判定の後、既存の `migrationSql` 生成ブロックの前に bumpRef 分岐を追加:

```ts
  // --- bumpRef モード (固定タグ運用: タグ作成 + registry ref bump) ---
  if (reqBody.bumpRef) {
    const changeKind = reqBody.changeKind ?? 'code'
    const includeMigration = changeKind === 'schema'

    // タグ採番
    const existingTags = await listTags(token, cartridgeRepo)
    const tagNames = existingTags

    // AppHarbor の registry から現在の pinned ref を取得
    const registryContent = await fetchRegistryContentDirect(token, targetRepo, targetBranch)
    const currentPinnedRef = getRegistryRef(registryContent, safe)
    if (!currentPinnedRef) {
      return NextResponse.json(
        { ok: false, error: `${safe} is not in AppHarbor registry` },
        { status: 400 },
      )
    }

    const newTag = reqBody.newTag ?? nextTag(version, currentPinnedRef, tagNames)

    // cart リポの main HEAD にタグを作成
    const headData = await getRepoDefaultBranchHead(token, cartridgeRepo)
    await createTag(token, cartridgeRepo, newTag, headData.sha)

    // migration SQL (schema 変更時のみ)
    let bumpMigrationSql = ''
    let bumpSchemaVersion = 1
    if (includeMigration) {
      const existing = await listExistingCartridgeMigrations(token, targetRepo, targetBranch, safe)
      const nextVerStr = determineNextVersion(safe, existing)
      bumpSchemaVersion = Number.parseInt(nextVerStr.replace(/^v/, ''), 10)

      const schemaReleasedPath = join(entry.path, 'db', 'schema.released.sql')
      if (!existsSync(schemaReleasedPath)) {
        return NextResponse.json(
          { ok: false, error: 'schema change detected but db/schema.released.sql is missing. Create it first.' },
          { status: 400 },
        )
      }
      const releasedSql = readFileSync(schemaReleasedPath, 'utf-8')
      const released = parseSchema(releasedSql)
      const current = parseSchema(schemaSql)
      const diff = diffSchemas(released, current)
      const warnings = findDestructiveWarnings(diff)
      const alterResult = generateAlterSql(diff, {
        cartridgeId: safe,
        nextVersion: nextVerStr,
        warnings,
      })
      bumpMigrationSql = alterResult.sql
    }

    try {
      const result = await createCartridgeInstallPr(token, {
        cartridgeRepo,
        cartridgeRef: 'main',
        targetRepo,
        targetBase: targetBranch,
        cartridgeId: safe,
        version,
        schemaVersion: bumpSchemaVersion,
        migrationSql: bumpMigrationSql,
        installMode: 'update',
        bumpRef: true,
        newTag,
        includeMigration,
      })
      return NextResponse.json({
        ok: true,
        ...result,
        newTag,
        installMode: 'bumpRef',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
  }
```

`install-to-appharbor/route.ts` の末尾（`generateInitialProductionMigration` の後）に、registry 取得ヘルパーを追加:

```ts
async function fetchRegistryContentDirect(
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
```

import に追加:

```ts
import { getRegistryRef } from '@/lib/github/registry-yaml'
import {
  listTags,
  nextTag,
  createTag,
  getRepoDefaultBranchHead,
} from '@/lib/github/github-ref'
```

- [ ] **Step 4: 型チェック**

```bash
npx tsc --noEmit --pretty
```

Expected: エラーなし（あれば型を修正）。

- [ ] **Step 5: Commit**

```bash
git add lib/github/cartridge-pr.ts app/api/cartridges/\[appId\]/install-to-appharbor/route.ts
git commit -m "feat: extend install-to-appharbor with bumpRef mode (tag creation + registry ref bump)"
```

---

## Task 6: PipelineSection.tsx — Stage 5 バナー + ボタン UI

**Files:**
- Modify: `components/PipelineSection.tsx`

- [ ] **Step 1: AppHarborStatus 型と state を追加**

ファイル先頭の型定義セクション（`CheckUpdatesResult` の後、約 line 132）に追加:

```ts
type AppHarborStatus = {
  pinnedRef?: string
  pinnedCommit?: string
  cartHead?: string
  cartBranch?: string
  cartridgeRepo?: string
  isNewer: boolean
  isPinnedTag?: boolean
  changeKind?: 'schema' | 'code' | 'none'
  aheadBy?: number
  changedFiles?: string[]
  hasSchemaReleased?: boolean
  manifestVersion?: string | null
  notRegistered?: boolean
  message?: string
  error?: string
}
```

`PipelineSection` コンポーネントの state 宣言（line 146 付近、`installResult` の後）に追加:

```ts
  const [ahStatus, setAhStatus] = useState<AppHarborStatus | null>(null)
  const [ahStatusLoading, setAhStatusLoading] = useState(false)
  const [bumpBusy, setBumpBusy] = useState(false)
  const [bumpResult, setBumpResult] = useState<{ ok: boolean; prUrl?: string; prNumber?: number; newTag?: string; error?: string } | null>(null)
```

- [ ] **Step 2: fetch 関数とエフェクトを追加**

`fetchStage5` の後（line 176 付近）に追加:

```ts
  const fetchAppHarborStatus = useCallback(async () => {
    setAhStatusLoading(true)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/appharbor-status`)
      if (res.ok) {
        const j = await res.json() as AppHarborStatus
        setAhStatus(j)
      }
    } catch { /* ignore */ }
    finally { setAhStatusLoading(false) }
  }, [appId])

  useEffect(() => {
    if (currentStage === 5) fetchAppHarborStatus()
  }, [currentStage, fetchAppHarborStatus])
```

- [ ] **Step 3: handleBumpRef ハンドラを追加**

`handleInstallToAppHarbor` の後（line 349 付近）に追加:

```ts
  const handleBumpRef = async () => {
    if (bumpBusy || !ahStatus) return
    const changeKind = ahStatus.changeKind ?? 'code'

    let confirmMsg = `AppHarbor の ${ahStatus.pinnedRef} → cart main (${ahStatus.aheadBy ?? '?'} commits ahead) に更新 PR を作成します。`
    if (changeKind === 'schema') {
      if (!ahStatus.hasSchemaReleased) {
        alert('db/schema.released.sql が未整備です。カートリッジリポに現在の schema.sql をコピーして schema.released.sql として commit してください。')
        return
      }
      confirmMsg += '\n\n⚠️ スキーマ変更を検出しました。migration SQL も同梱されます。'
    }
    confirmMsg += '\n\nタグを自動作成し、AppHarbor に PR を送信します。よろしいですか？'
    if (!confirm(confirmMsg)) return

    setBumpBusy(true)
    setBumpResult(null)
    try {
      const res = await fetch(`/api/cartridges/${encodeURIComponent(appId)}/install-to-appharbor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bumpRef: true, changeKind }),
      })
      const j = await res.json()
      setBumpResult(j)
      if (j.ok) {
        // 成功 → status を再取得 (isNewer が false になるはず)
        fetchAppHarborStatus()
      }
    } catch (e) {
      setBumpResult({ ok: false, error: (e as Error).message })
    } finally {
      setBumpBusy(false)
    }
  }
```

- [ ] **Step 4: Stage 5 セクションのレンダリングに AppHarbor status バナーを追加**

既存の Stage 5 "メインアクション" ブロック（line 1228 `{/* メインアクション: AppHarbor 本番に PR を作成 */}` のコメント）の **前** に、以下の AppHarbor status バナーを追加:

```tsx
                  {/* AppHarbor pinned ref 更新検知バナー */}
                  {ahStatusLoading && (
                    <div className="rounded border border-muted p-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      AppHarbor の状態を確認中...
                    </div>
                  )}
                  {ahStatus && !ahStatus.error && ahStatus.isPinnedTag && ahStatus.isNewer && (
                    <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                      <div className="text-xs font-semibold text-amber-800">
                        AppHarbor: {ahStatus.pinnedRef} / cart: {ahStatus.aheadBy != null && ahStatus.aheadBy >= 0
                          ? `${ahStatus.aheadBy} commits ahead`
                          : 'ahead'}
                        {ahStatus.changeKind === 'schema' && ' (schema change)'}
                        {ahStatus.changeKind === 'code' && ' (code only)'}
                      </div>
                      <p className="text-[11px] text-amber-700">
                        カートリッジリポが AppHarbor の pinned tag より進んでいます。
                        {ahStatus.changeKind === 'schema' && !ahStatus.hasSchemaReleased && (
                          <> スキーマ変更を含みますが、<strong>db/schema.released.sql</strong> が未整備です。先にコミットしてください。</>
                        )}
                        {ahStatus.changeKind === 'schema' && ahStatus.hasSchemaReleased && (
                          <> スキーマ変更を含みます。migration SQL が自動生成されます。</>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleBumpRef}
                          disabled={bumpBusy || (ahStatus.changeKind === 'schema' && !ahStatus.hasSchemaReleased)}
                          className="gap-1.5 bg-amber-600 hover:bg-amber-700"
                        >
                          {bumpBusy
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <ArrowRight className="h-3.5 w-3.5" />}
                          {bumpBusy ? '更新 PR 作成中...' : '更新 PR を作成'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchAppHarborStatus}
                          disabled={ahStatusLoading}
                          className="gap-1.5"
                        >
                          <RefreshCw className={cn('h-3.5 w-3.5', ahStatusLoading && 'animate-spin')} />
                          再チェック
                        </Button>
                      </div>
                      {bumpResult?.ok && bumpResult.prUrl && (
                        <div className="text-xs text-amber-700">
                          <a
                            href={bumpResult.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-900"
                          >
                            PR #{bumpResult.prNumber} を開く (tag: {bumpResult.newTag}) &rarr;
                          </a>
                        </div>
                      )}
                      {bumpResult && !bumpResult.ok && (
                        <div className="text-[11px] text-destructive">
                          {bumpResult.error}
                        </div>
                      )}
                    </div>
                  )}
                  {ahStatus && !ahStatus.error && ahStatus.isPinnedTag === false && (
                    <div className="rounded border border-muted p-3 text-[11px] text-muted-foreground">
                      このカートリッジは ref: main（自動反映）です。固定タグ運用に切替えると更新 PR を使えます。
                    </div>
                  )}
                  {ahStatus && ahStatus.isPinnedTag && !ahStatus.isNewer && !ahStatusLoading && (
                    <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-[11px] text-emerald-700">
                      <Check className="inline h-3.5 w-3.5 mr-1" />
                      AppHarbor は最新 ({ahStatus.pinnedRef})
                    </div>
                  )}
```

- [ ] **Step 5: dev server で手動検証**

```bash
npm run dev
```

1. ブラウザで Studio を開き、daigamen-test の Stage 5 パネルを表示
2. GITHUB_TOKEN が設定されていれば、AppHarbor status バナーが表示される
3. isNewer=true ならアンバー色のバナー + ボタンが出る
4. isNewer=false なら緑のチェックマーク「AppHarbor は最新」が出る

- [ ] **Step 6: Commit**

```bash
git add components/PipelineSection.tsx
git commit -m "feat: add AppHarbor status banner and bump PR button to Stage 5"
```

---

## Task 7: stage5-prepare の registryEntry 修正

**Files:**
- Modify: `app/api/cartridges/[appId]/stage5-prepare/route.ts`

- [ ] **Step 1: registryEntry 生成を固定タグ運用対応にする**

`stage5-prepare/route.ts` の line 155-157 (registryEntry 生成) を修正。現在はハードコード `ref: main` なので、固定タグ運用のカートリッジにはよろしくない。`mode: 'update'` のとき、registryEntry は表示しても意味がないので空にする:

```ts
  // AppHarbor registry entry (初回投入時のみ意味あり)
  // update モードでは registry エントリは既に登録済みなので表示しない
  const registryEntry = isUpdateMode
    ? '(既に AppHarbor に登録済み — registry の ref は更新 PR で自動 bump されます)'
    : repoSlug
      ? `  - id: ${safe}\n    repo: ${repoSlug}\n    ref: main\n    version: "${version}"\n    mode: installed\n    enabled: true`
      : `  - id: ${safe}\n    repo: YOUR_GITHUB_USER/${safe}\n    ref: main\n    version: "${version}"\n    mode: installed\n    enabled: true`
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cartridges/\[appId\]/stage5-prepare/route.ts
git commit -m "fix: stage5-prepare registryEntry shows help text in update mode"
```

---

## Task 8: 全体テスト + 型チェック

**Files:** (none — verification only)

- [ ] **Step 1: 全テスト実行**

```bash
npm test
```

Expected: registry-yaml, github-ref のテストが ALL PASS。

- [ ] **Step 2: 型チェック**

```bash
npx tsc --noEmit --pretty
```

Expected: エラーなし。

- [ ] **Step 3: lint**

```bash
npm run lint
```

Expected: 新規ファイルに致命的エラーなし。

- [ ] **Step 4: dev server で E2E 手動検証**

```bash
npm run dev
```

1. Studio を開く → daigamen-test → Stage 5
2. AppHarbor status バナーが表示される
3. (cart が ahead なら) 「更新 PR を作成」ボタンが表示される
4. ボタンをクリック → confirm → PR が作成される
5. GitHub で PR を確認: `cartridges-registry.yaml` の `ref` が新タグに更新されている

- [ ] **Step 5: 最終 Commit (もし未 commit の修正があれば)**

```bash
git status
# 必要なら修正を commit
```
