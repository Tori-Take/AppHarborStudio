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
