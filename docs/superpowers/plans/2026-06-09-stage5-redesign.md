# Stage 5 再設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 5 を `appharbor-status`（本番比較）を唯一の真実の源とする 4 状態モデルに一本化し、矛盾する重複 UI と手動「完了」を撤去して、主アクションを 1 つにする。

**Architecture:** 状態判定を純粋関数 `deriveReleaseState()` に切り出して単体テスト可能にする。表示は新コンポーネント `components/stage5/ReleasePanel.tsx` に集約。`appharbor-status` に「未マージ PR 検知（openPr）」を 1 つ追加。既存の `install-to-appharbor` / `schema-diff` バックエンドは再利用（撤去するのは重複 UI のみ）。

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, vitest, GitHub REST API (raw fetch)

**対象リポ:** `C:\Users\torit\Desktop\Projects\AppHarbor-Studio`（ブランチ `feat/stage5-redesign`）
**Spec:** `docs/superpowers/specs/2026-06-09-stage5-redesign-design.md`

---

## File Map

### 新規作成
| File | 責務 |
|---|---|
| `lib/release-state.ts` | `AppHarborStatus` → `ReleaseState`（4状態＋edge）を返す純粋関数と型 |
| `lib/__tests__/release-state.test.ts` | `deriveReleaseState` の単体テスト |
| `lib/github/__tests__/release-pr.test.ts` | open PR ブランチ判定の単体テスト |
| `components/stage5/ReleasePanel.tsx` | 状態別表示＋単一主アクション＋詳細折りたたみ |

### 変更
| File | 変更 |
|---|---|
| `app/api/cartridges/[appId]/appharbor-status/route.ts` | `openPr` 検知を追加 |
| `lib/github/cartridge-pr.ts` | open PR ブランチ判定の純粋関数 `matchesCartReleaseBranch` を追加（export） |
| `components/PipelineSection.tsx` | `ReleasePanel` に置換、重複 UI 撤去、ステッパー Stage5 を本番反映で点灯、手動「完了」撤去 |

---

## Task 1: open PR ブランチ判定（純粋関数 + テスト）

**Files:**
- Modify: `lib/github/cartridge-pr.ts`
- Create: `lib/github/__tests__/release-pr.test.ts`

- [ ] **Step 1: テストを書く**

```ts
// lib/github/__tests__/release-pr.test.ts
import { describe, it, expect } from 'vitest'
import { matchesCartReleaseBranch } from '../cartridge-pr'

describe('matchesCartReleaseBranch', () => {
  it('matches bump branch for the id', () => {
    expect(matchesCartReleaseBranch('cart-bump/daigamen-test-v1-20260607085228', 'daigamen-test')).toBe(true)
  })
  it('matches install branch', () => {
    expect(matchesCartReleaseBranch('cart-install/daigamen-test-v1-20260101000000', 'daigamen-test')).toBe(true)
  })
  it('matches update branch', () => {
    expect(matchesCartReleaseBranch('cart-update/daigamen-test-v2-20260101000000', 'daigamen-test')).toBe(true)
  })
  it('does not match a different cartridge', () => {
    expect(matchesCartReleaseBranch('cart-bump/other-app-v1-x', 'daigamen-test')).toBe(false)
  })
  it('does not match unrelated branches', () => {
    expect(matchesCartReleaseBranch('feature/foo', 'daigamen-test')).toBe(false)
  })
  it('handles id that is a prefix of another id (boundary)', () => {
    // "daigamen" should NOT match a "daigamen-test" branch
    expect(matchesCartReleaseBranch('cart-bump/daigamen-test-v1-x', 'daigamen')).toBe(false)
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run lib/github/__tests__/release-pr.test.ts`
Expected: FAIL — `matchesCartReleaseBranch` is not exported

- [ ] **Step 3: 実装**

`lib/github/cartridge-pr.ts` の末尾に追加:

```ts
/**
 * AppHarbor の PR head ブランチ名が、指定カートリッジの「本番反映 PR」
 * (cart-bump / cart-install / cart-update のいずれか) かどうかを判定する。
 * ブランチ名は `${prefix}/${cartridgeId}-v${n}-${ts}` 形式 (createCartridgeInstallPr 参照)。
 */
export function matchesCartReleaseBranch(branch: string, cartridgeId: string): boolean {
  const escaped = cartridgeId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  // prefix/<id>-v<digits>-... の形。<id> の直後は必ず "-v数字" が来る境界で厳密一致
  const re = new RegExp(`^(cart-bump|cart-install|cart-update)/${escaped}-v\\d`)
  return re.test(branch)
}
```

- [ ] **Step 4: 通過を確認**

Run: `npx vitest run lib/github/__tests__/release-pr.test.ts`
Expected: PASS (6)

- [ ] **Step 5: Commit**

```bash
git add lib/github/cartridge-pr.ts lib/github/__tests__/release-pr.test.ts
git commit -m "feat: add matchesCartReleaseBranch for open-PR detection"
```

---

## Task 2: appharbor-status に openPr 検知を追加

**Files:**
- Modify: `app/api/cartridges/[appId]/appharbor-status/route.ts`

- [ ] **Step 1: open PR を探すヘルパーを追加**

import に追加:

```ts
import { getRegistryRef } from '@/lib/github/registry-yaml'
import { matchesCartReleaseBranch } from '@/lib/github/cartridge-pr'
```

ファイル末尾（`fetchCommitDate` の後）にヘルパーを追加:

```ts
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
```

- [ ] **Step 2: isNewer のときに openPr を取得して返す**

`if (isNewer) { ... }` ブロックの最後（`cartHeadDate = ...` の直後）に追加:

```ts
      openPr = await findOpenReleasePr(token, targetRepo, safe)
```

ブロック前の変数宣言（`let cartHeadDate ...` の並び）に追加:

```ts
    let openPr: { url: string; number: number } | null = null
```

レスポンス（`return NextResponse.json({ ... })`）に `openPr,` を追加。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit 2>&1 | grep appharbor-status`
Expected: 出力なし（クリーン）

- [ ] **Step 4: Commit**

```bash
git add app/api/cartridges/\[appId\]/appharbor-status/route.ts
git commit -m "feat: appharbor-status detects an open release PR (openPr)"
```

---

## Task 3: 状態判定の純粋関数 + テスト

**Files:**
- Create: `lib/release-state.ts`
- Create: `lib/__tests__/release-state.test.ts`

- [ ] **Step 1: テストを書く**

```ts
// lib/__tests__/release-state.test.ts
import { describe, it, expect } from 'vitest'
import { deriveReleaseState, type AppHarborStatusLike } from '../release-state'

const base: AppHarborStatusLike = { isNewer: false }

describe('deriveReleaseState', () => {
  it('loading when status is null and loading', () => {
    expect(deriveReleaseState(null, true).kind).toBe('loading')
  })
  it('error when status has error', () => {
    expect(deriveReleaseState({ ...base, error: 'boom' }, false)).toEqual({ kind: 'error', message: 'boom' })
  })
  it('not-registered', () => {
    expect(deriveReleaseState({ ...base, notRegistered: true }, false).kind).toBe('not-registered')
  })
  it('ref-main when not a pinned tag', () => {
    expect(deriveReleaseState({ ...base, isPinnedTag: false }, false).kind).toBe('ref-main')
  })
  it('up-to-date when registered, pinned, not newer', () => {
    const r = deriveReleaseState({ isNewer: false, isPinnedTag: true, pinnedRef: 'v0.1.7' }, false)
    expect(r).toEqual({ kind: 'up-to-date', version: 'v0.1.7' })
  })
  it('pr-pending when newer and an open PR exists', () => {
    const r = deriveReleaseState(
      { isNewer: true, isPinnedTag: true, openPr: { url: 'u', number: 114 } }, false,
    )
    expect(r).toEqual({ kind: 'pr-pending', prUrl: 'u', prNumber: 114 })
  })
  it('behind when newer and no open PR (code)', () => {
    const r = deriveReleaseState(
      { isNewer: true, isPinnedTag: true, changeKind: 'code' }, false,
    )
    expect(r.kind).toBe('behind')
    if (r.kind === 'behind') expect(r.changeKind).toBe('code')
  })
  it('behind schema carries hasSchemaReleased', () => {
    const r = deriveReleaseState(
      { isNewer: true, isPinnedTag: true, changeKind: 'schema', hasSchemaReleased: false }, false,
    )
    expect(r.kind).toBe('behind')
    if (r.kind === 'behind') expect(r.schemaBlocked).toBe(true)
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run lib/__tests__/release-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 実装**

```ts
// lib/release-state.ts

/** appharbor-status のレスポンス（判定に使う部分のみ） */
export type AppHarborStatusLike = {
  isNewer: boolean
  isPinnedTag?: boolean
  notRegistered?: boolean
  error?: string
  pinnedRef?: string
  changeKind?: 'schema' | 'code' | 'none'
  hasSchemaReleased?: boolean
  openPr?: { url: string; number: number } | null
}

export type ReleaseState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-registered' }
  | { kind: 'ref-main' }
  | { kind: 'up-to-date'; version: string }
  | { kind: 'pr-pending'; prUrl: string; prNumber: number }
  | { kind: 'behind'; changeKind: 'code' | 'schema'; schemaBlocked: boolean }

/**
 * appharbor-status の結果から Stage 5 の単一状態を導出する。
 * これが Stage 5 表示・ステッパー点灯の「唯一の真実」。
 */
export function deriveReleaseState(
  s: AppHarborStatusLike | null,
  loading: boolean,
): ReleaseState {
  if (!s) return loading ? { kind: 'loading' } : { kind: 'error', message: 'no status' }
  if (s.error) return { kind: 'error', message: s.error }
  if (s.notRegistered) return { kind: 'not-registered' }
  if (s.isPinnedTag === false) return { kind: 'ref-main' }
  if (!s.isNewer) return { kind: 'up-to-date', version: s.pinnedRef ?? '' }
  if (s.openPr) return { kind: 'pr-pending', prUrl: s.openPr.url, prNumber: s.openPr.number }
  const changeKind = s.changeKind === 'schema' ? 'schema' : 'code'
  const schemaBlocked = changeKind === 'schema' && s.hasSchemaReleased === false
  return { kind: 'behind', changeKind, schemaBlocked }
}
```

- [ ] **Step 4: 通過を確認**

Run: `npx vitest run lib/__tests__/release-state.test.ts`
Expected: PASS (8)

- [ ] **Step 5: Commit**

```bash
git add lib/release-state.ts lib/__tests__/release-state.test.ts
git commit -m "feat: add deriveReleaseState (single source of truth for Stage 5)"
```

---

## Task 4: ReleasePanel コンポーネント（状態別表示＋単一アクション）

**Files:**
- Create: `components/stage5/ReleasePanel.tsx`

このコンポーネントは `ahStatus`（appharbor-status の結果）と各ハンドラを props で受け取り、`deriveReleaseState` で 1 状態に確定して描画する。型チェック/生成物コピー/差分SQL は `details` スロットとして受け取り `<details>` に折りたたむ。

- [ ] **Step 1: コンポーネントを作成**

```tsx
// components/stage5/ReleasePanel.tsx
'use client'

import { Loader2, ArrowRight, RefreshCw, Check, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { deriveReleaseState, type AppHarborStatusLike } from '@/lib/release-state'

export type AppHarborStatus = AppHarborStatusLike & {
  pinnedCommit?: string
  cartHead?: string
  manifestVersion?: string | null
  pinnedVersion?: string | null
  pinnedCommitDate?: string | null
  cartHeadDate?: string | null
  aheadBy?: number
  changedFiles?: string[]
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

type Props = {
  status: AppHarborStatus | null
  loading: boolean
  busy: boolean
  /** 主アクション。状態に応じて呼び分けは親で行う（behind/not-registered 共通の「本番に反映」） */
  onRelease: () => void
  onRecheck: () => void
  /** 詳細・手動操作（型チェック / 生成物コピー / 差分SQL）。折りたたみに入れる */
  details?: React.ReactNode
  /** 直近の結果リンク（PR 作成成功時など） */
  resultNode?: React.ReactNode
}

export function ReleasePanel({ status, loading, busy, onRelease, onRecheck, details, resultNode }: Props) {
  const st = deriveReleaseState(status, loading)

  if (st.kind === 'loading') {
    return (
      <div className="rounded border border-muted p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> AppHarbor の状態を確認中...
      </div>
    )
  }

  if (st.kind === 'error') {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-[11px] text-destructive">
        AppHarbor の状態を取得できませんでした: {st.message}
        <div className="mt-2"><RecheckButton onRecheck={onRecheck} loading={loading} /></div>
      </div>
    )
  }

  if (st.kind === 'ref-main') {
    return (
      <div className="rounded border border-muted p-3 text-[11px] text-muted-foreground">
        このカートリッジは自動反映設定です。固定バージョン運用に切り替えると本番反映を管理できます。
      </div>
    )
  }

  if (st.kind === 'up-to-date') {
    return (
      <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-emerald-700">
          <Check className="inline h-3.5 w-3.5 mr-1" />
          本番は最新です（{st.version}）
        </span>
        <RecheckButton onRecheck={onRecheck} loading={loading} />
      </div>
    )
  }

  if (st.kind === 'pr-pending') {
    return (
      <div className="rounded border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
        <div className="text-[11px] text-blue-800">
          <Clock className="inline h-3.5 w-3.5 mr-1" />
          <a href={st.prUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">
            PR #{st.prNumber} マージ待ち
          </a>
          {' '}— マージすると本番に反映されます
        </div>
        <RecheckButton onRecheck={onRecheck} loading={loading} />
      </div>
    )
  }

  if (st.kind === 'not-registered') {
    return (
      <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
        <div className="text-xs font-semibold text-amber-800">本番にまだありません</div>
        <p className="text-[11px] text-amber-700">このカートリッジを AppHarbor 本番に初めて反映します。</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onRelease} disabled={busy} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            {busy ? '作成中...' : '本番に反映する（初回 PR を作成）'}
          </Button>
          <RecheckButton onRecheck={onRecheck} loading={loading} />
        </div>
        {resultNode}
        {details && <DetailsDisclosure>{details}</DetailsDisclosure>}
      </div>
    )
  }

  // st.kind === 'behind'
  const s = status!
  return (
    <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
      <div className="text-xs font-semibold text-amber-800">
        更新あり: cart が本番より {s.aheadBy != null && s.aheadBy >= 0 ? `${s.aheadBy} commit 先行` : '先行'}
        {st.changeKind === 'schema' ? '（データ構造の変更あり）' : '（コードのみ）'}
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-[11px]">
        <div></div>
        <div className="font-medium text-amber-800">本番に出ている版</div>
        <div className="font-medium text-amber-800">このカートリッジの最新</div>

        <div className="text-amber-700/70">バージョン</div>
        <div className="font-mono text-amber-900">{s.pinnedVersion ?? '—'}</div>
        <div className="font-mono text-amber-900">{s.manifestVersion ?? '—'}</div>

        <div className="text-amber-700/70">コミット</div>
        <div className="font-mono text-amber-900">{s.pinnedCommit ? s.pinnedCommit.slice(0, 7) : '—'}</div>
        <div className="font-mono text-amber-900">{s.cartHead ? s.cartHead.slice(0, 7) : '—'}</div>

        <div className="text-amber-700/70">更新日時</div>
        <div className="font-mono text-amber-900">{fmtDate(s.pinnedCommitDate)}</div>
        <div className="font-mono text-amber-900">{fmtDate(s.cartHeadDate)}</div>
      </div>

      {s.changedFiles && s.changedFiles.length > 0 && (
        <div className="text-[11px] text-amber-700">
          <span className="text-amber-700/70">変更: </span>
          {s.changedFiles.slice(0, 4).join(', ')}
          {s.changedFiles.length > 4 && ` …(計 ${s.changedFiles.length} 件)`}
        </div>
      )}

      {st.schemaBlocked && (
        <p className="text-[11px] text-amber-700">
          データ構造の変更を含みますが、<strong>db/schema.released.sql</strong> が未整備です。先にコミットしてください。
        </p>
      )}
      {st.changeKind === 'schema' && !st.schemaBlocked && (
        <p className="text-[11px] text-amber-700">データ構造の変更を含むため migration も自動生成されます。</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={onRelease}
          disabled={busy || st.schemaBlocked}
          className="gap-1.5 bg-amber-600 hover:bg-amber-700"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          {busy ? '作成中...' : '本番に反映する（PR を作成）'}
        </Button>
        <RecheckButton onRecheck={onRecheck} loading={loading} />
      </div>

      {resultNode}
      {details && <DetailsDisclosure>{details}</DetailsDisclosure>}
    </div>
  )
}

function RecheckButton({ onRecheck, loading }: { onRecheck: () => void; loading: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onRecheck} disabled={loading} className="gap-1.5">
      <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
      再確認
    </Button>
  )
}

function DetailsDisclosure({ children }: { children: React.ReactNode }) {
  return (
    <details className="text-[11px] text-muted-foreground">
      <summary className="cursor-pointer hover:text-foreground">詳細・手動操作</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  )
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit 2>&1 | grep ReleasePanel`
Expected: 出力なし

- [ ] **Step 3: Commit**

```bash
git add components/stage5/ReleasePanel.tsx
git commit -m "feat: add ReleasePanel (single Stage 5 status + one action)"
```

---

## Task 5: PipelineSection に組み込み、重複 UI を撤去

**Files:**
- Modify: `components/PipelineSection.tsx`

ゴール: Stage 5 の本文（`{currentStage === 5 && ( ... )}`、現状 ~963–1600）の中で、**本番反映に関する表示を `ReleasePanel` 1 つに集約**し、System A の重複 UI を撤去する。`stage5` 由来の生成物（型チェック・コピー・差分SQL）は ReleasePanel の `details` に渡す。

> 既存ハンドラ `handleBumpRef`（behind）と `handleInstallToAppHarbor`（initial）を**主アクション 1 つ**に束ねる。`onRelease` は状態で呼び分ける薄いラッパを新設。

- [ ] **Step 1: import 追加**

`components/PipelineSection.tsx` の import に:

```ts
import { ReleasePanel } from '@/components/stage5/ReleasePanel'
import { deriveReleaseState } from '@/lib/release-state'
```

- [ ] **Step 2: 主アクションのラッパを追加**

`handleBumpRef` の後に、状態で呼び分ける `handleRelease` を追加:

```ts
  const handleRelease = () => {
    const st = deriveReleaseState(ahStatus, ahStatusLoading)
    if (st.kind === 'behind') {
      handleBumpRef()
    } else if (st.kind === 'not-registered') {
      handleInstallToAppHarbor()
    }
  }
```

- [ ] **Step 3: 既存の琥珀バナー＋青/緑パネルを ReleasePanel に置換**

`{/* AppHarbor pinned ref 更新検知バナー */}`（現状 ~1306）から、`{/* メインアクション: AppHarbor 本番に PR を作成 */}` の青/緑パネル（`handleInstallToAppHarbor` ボタンを含むブロック、~1431–1500）と、その下の `ahStatus.isPinnedTag === false` バナー・`!ahStatus.isNewer` の緑バナー（~1417–1428）までの**一連の本番反映系 JSX をすべて削除**し、次の 1 ブロックに置き換える:

```tsx
                  {/* 本番反映: 状態に応じた単一パネル */}
                  <ReleasePanel
                    status={ahStatus}
                    loading={ahStatusLoading}
                    busy={bumpBusy || installBusy}
                    onRelease={handleRelease}
                    onRecheck={fetchAppHarborStatus}
                    resultNode={
                      bumpResult && (bumpResult.ok
                        ? bumpResult.prUrl && (
                          <div className="text-xs text-amber-700">
                            <a href={bumpResult.prUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900">
                              PR #{bumpResult.prNumber} を開く（tag: {bumpResult.newTag}）&rarr;
                            </a>
                          </div>
                        )
                        : <div className="text-[11px] text-destructive">{bumpResult.error}</div>)
                    }
                    details={
                      <Stage5Details
                        stage5={stage5}
                        appId={appId}
                        typeCheckBusy={typeCheckBusy}
                        typeCheckResult={typeCheckResult}
                        onTypeCheck={handleTypeCheck}
                        stage5Copied={stage5Copied}
                        setStage5Copied={setStage5Copied}
                      />
                    }
                  />
```

> 注: 削除対象は「本番反映の表示・ボタン」系のみ。`stage5`（差分・migration・コピー）由来のデータは `Stage5Details`（Step 4）に移す。

- [ ] **Step 4: 型チェック/生成物コピー/差分SQL を `Stage5Details` にまとめる**

削除した「📊 schema 差分サマリ」「🔍 PR 作成前にローカル型チェック」「手動で進めたい場合（生成物のコピー）」「ALTER migration SQL」の JSX を、`components/stage5/Stage5Details.tsx` に切り出して移設する（props 経由で `stage5` / typeCheck 状態 / コピー状態を受け取る）。フックは持たず表示のみ。

> ※ 既存 JSX をそのまま移すだけなので新規ロジックは無い。`stage5.mode === 'update'` の差分サマリ・`stage5.warnings`・`manualChangesNeeded`・`productionMigration` のコピーボタンは details 内に残す（撤去ではなく折りたたみ）。

- [ ] **Step 5: 「4つの緑チェック」「registry エントリ表示」「📋 PR マージ後の作業」の整理**

- 4 チェック（manifest/schema/routes/GitHub, ~986–1030 の checks 描画）: **撤去**（Stage 5 では既済）。
- `stage5.registryEntry` 表示（~1226 付近）: **撤去**。
- 「📋 PR マージ後の作業」（~1565–）: **最小化**。残すのは「マージ後、本番 Supabase に migration 適用（schema 変更時のみ）」の 1 行だけにする。

- [ ] **Step 6: 型チェック & lint & test**

Run:
```bash
npx tsc --noEmit 2>&1 | grep PipelineSection ; echo done
npx eslint components/PipelineSection.tsx components/stage5/*.tsx ; echo "lint $?"
npm test
```
Expected: tsc 出力なし / lint exit 0 / tests 全 pass

- [ ] **Step 7: Commit**

```bash
git add components/PipelineSection.tsx components/stage5/
git commit -m "refactor: consolidate Stage 5 release UI into ReleasePanel; remove duplicates"
```

---

## Task 6: ステッパー Stage 5 を本番反映状態で点灯／手動「完了」撤去

**Files:**
- Modify: `components/PipelineSection.tsx`

- [ ] **Step 1: 手動「Stage 5 完了」ボタンを撤去**

`{stage5.allOk && !stages[5].completed && ( ... markCompleted(5) ... 'Stage 5 完了' ... )}`（~1551–1558）を**削除**。

- [ ] **Step 2: ステッパーの Stage 5 ノードを本番反映状態で点灯**

`STAGES.map(...)`（~587）の各ノードのアイコン/色決定で、`stage.num === 5` のときは `stages[5].completed` ではなく `deriveReleaseState(ahStatus, ahStatusLoading)` を使う:

```tsx
// ノードのアイコン/色を決める箇所で、stage.num === 5 のとき:
//   up-to-date  → 緑チェック（完了相当）
//   pr-pending  → 進行中（スピナー or 中間色）
//   behind / not-registered → 琥珀（要対応）
//   それ以外（loading/error/ref-main）→ 既存の中立表示
```

実装は `STAGES.map` の冒頭で次を計算して分岐に使う:

```tsx
            const releaseSt = stage.num === 5 ? deriveReleaseState(ahStatus, ahStatusLoading) : null
            const stage5Done = releaseSt?.kind === 'up-to-date'
            const stage5Pending = releaseSt?.kind === 'pr-pending'
            const stage5Attention = releaseSt?.kind === 'behind' || releaseSt?.kind === 'not-registered'
```

そのうえで Stage 5 ノードの「完了チェック表示」を `stages[5].completed || stage5Done` に、注意色を `stage5Attention` に対応づける（既存のクラス分岐に条件を足す）。

> Stage 1–4 の表示ロジックは変更しない。

- [ ] **Step 3: check-updates トリガーの整合**

`stages[5].completed` をトリガーにしている `fetchUpdates`（~265–271 の useEffect）は**ロールバック用として残す**が、Stage 5 完了フラグが手動で立たなくなるため、トリガー条件を「Stage 4 完了済み（= currentStage 5 到達）」に変更する:

```tsx
  useEffect(() => {
    if (stages[4].completed) fetchUpdates()
    else setUpdates(null)
  }, [stages, fetchUpdates])
```

（変更検出バナー自体（~470）は残置。ロールバック専用の役割は spec §7 の通り。）

- [ ] **Step 4: 型チェック & lint & test**

Run:
```bash
npx tsc --noEmit 2>&1 | grep PipelineSection ; echo done
npx eslint components/PipelineSection.tsx ; echo "lint $?"
npm test
```
Expected: tsc 出力なし / lint exit 0 / tests pass

- [ ] **Step 5: Commit**

```bash
git add components/PipelineSection.tsx
git commit -m "feat: derive Stage 5 stepper from release state; drop manual completion"
```

---

## Task 7: 全体検証

**Files:** (verification only)

- [ ] **Step 1: 全テスト**

Run: `npm test`
Expected: release-state / release-pr / registry-yaml / github-ref すべて pass

- [ ] **Step 2: 型チェック（変更ファイル）**

Run: `npx tsc --noEmit 2>&1 | grep -E "PipelineSection|ReleasePanel|release-state|appharbor-status|Stage5Details" ; echo done`
Expected: 出力なし

- [ ] **Step 3: lint**

Run: `npm run lint`
Expected: exit 0（warnings は既存 backlog 可）

- [ ] **Step 4: 実機 E2E（Studio 起動）**

```bash
npm run dev
```
daigamen-test の Stage 5 を開き、状態に応じて以下を確認:
- 本番=cart 最新 → 「✅ 本番は最新です」だけ（ボタン1個＝再確認のみ）
- cart を更新 → 「更新あり」＋新旧テーブル＋**「本番に反映する」ボタン1個**
- 反映 PR 作成後（再確認）→ 「⏳ PR #N マージ待ち」
- **矛盾するメッセージ・2つ目の PR ボタンが無い**こと
- ステッパー Stage 5 が状態色で点灯（最新=緑 / 更新あり=琥珀 / PR待ち=進行中）

- [ ] **Step 5: 仕上げ**

```bash
git status
# 残差分があれば commit
```

---

## Self-Review メモ

- spec §2–§9 の各項目に対応タスクあり（状態モデル=T3、openPr=T1/T2、単一パネル=T4、撤去=T5、完了整合=T6、用語=T4 の文言）。
- 型整合: `AppHarborStatusLike`（T3）⊂ `AppHarborStatus`（T4）。`deriveReleaseState` のシグネチャは T3/T5/T6 で一致。`matchesCartReleaseBranch`（T1）を T2 で使用。
- 既存 backend（install-to-appharbor / schema-diff / stage5-prepare）は不変。撤去は UI のみ。
