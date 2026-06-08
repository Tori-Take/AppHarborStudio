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
    expect(matchesCartReleaseBranch('cart-bump/daigamen-test-v1-x', 'daigamen')).toBe(false)
  })
})
