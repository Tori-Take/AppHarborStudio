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
