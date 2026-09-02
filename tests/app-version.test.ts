import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolveRuntimeAppVersion, isDevVersionSentinel } from '../server/utils/app-version'

describe('isDevVersionSentinel', () => {
  it('treats empty and common dev markers as sentinel', () => {
    expect(isDevVersionSentinel(undefined)).toBe(true)
    expect(isDevVersionSentinel('')).toBe(true)
    expect(isDevVersionSentinel('  ')).toBe(true)
    expect(isDevVersionSentinel('0.0.0-dev')).toBe(true)
    expect(isDevVersionSentinel('DEV')).toBe(true)
  })

  it('does not flag release-like versions', () => {
    expect(isDevVersionSentinel('1.0.0')).toBe(false)
    expect(isDevVersionSentinel('2.3.4-rc.1')).toBe(false)
  })
})

describe('resolveRuntimeAppVersion', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('in development, keeps APP_VERSION=0.0.0-dev over package.json', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_VERSION', '0.0.0-dev')
    delete process.env.NUXT_PUBLIC_APP_VERSION
    expect(resolveRuntimeAppVersion().version).toBe('0.0.0-dev')
  })

  it('in production, ignores APP_VERSION sentinel and uses package.json', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_VERSION', '0.0.0-dev')
    delete process.env.NUXT_PUBLIC_APP_VERSION
    expect(resolveRuntimeAppVersion().version).toBe('1.0.6')
  })

  it('in production, keeps explicit APP_VERSION when not a sentinel', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_VERSION', '9.8.7')
    expect(resolveRuntimeAppVersion().version).toBe('9.8.7')
  })

  it('in production, ignores whitespace-only APP_VERSION', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_VERSION', '   ')
    delete process.env.NUXT_PUBLIC_APP_VERSION
    expect(resolveRuntimeAppVersion().version).toBe('1.0.6')
  })

  it('trims BUILD_ID and maps empty to undefined', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BUILD_ID', '  run-42  ')
    expect(resolveRuntimeAppVersion().build).toBe('run-42')
    vi.stubEnv('BUILD_ID', '   ')
    expect(resolveRuntimeAppVersion().build).toBeUndefined()
  })
})
