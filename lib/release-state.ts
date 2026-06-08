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
