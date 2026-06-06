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
