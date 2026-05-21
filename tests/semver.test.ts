import { describe, it, expect } from 'vitest'
import { cleanVersion, compareSemver, compareSemverOrder, relativeSemver } from '../server/utils/semver'

describe('semver utils', () => {
  it('DEP01 - cleanVersion strips caret', () => {
    expect(cleanVersion('^3.4.0')).toBe('3.4.0')
  })

  it('DEP02 - cleanVersion strips tilde', () => {
    expect(cleanVersion('~1.2.3')).toBe('1.2.3')
  })

  it('DEP03 - compareSemver detects major', () => {
    expect(compareSemver('3.0.0', '4.0.0')).toBe('major')
  })

  it('DEP04 - compareSemver detects minor', () => {
    expect(compareSemver('3.0.0', '3.1.0')).toBe('minor')
  })

  it('DEP05 - compareSemver detects patch', () => {
    expect(compareSemver('3.0.0', '3.0.1')).toBe('patch')
  })

  it('DEP06 - compareSemver detects up-to-date', () => {
    expect(compareSemver('3.0.0', '3.0.0')).toBe('up-to-date')
  })

  it('DEP07 - compareSemver returns unknown on invalid', () => {
    expect(compareSemver('invalid', '3.0.0')).toBe('unknown')
  })

  it('DEP08 - relativeSemver detects ahead', () => {
    expect(relativeSemver('4.4.1', '4.4.0')).toBe('ahead')
    expect(compareSemver('4.4.1', '4.4.0')).toBe('up-to-date')
  })

  it('DEP09 - compareSemverOrder orders versions', () => {
    expect(compareSemverOrder('4.4.0', '4.4.1')).toBe(-1)
    expect(compareSemverOrder('4.4.1', '4.4.1')).toBe(0)
    expect(compareSemverOrder('5.0.0', '4.9.9')).toBe(1)
  })
})
