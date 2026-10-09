import { describe, it, expect, afterEach } from 'vitest'
import {
  resolveHeaderAuthEnabled,
  resolveHeaderTrustWithoutToken,
  resolveJitEnabled,
  resolveHeaderUserHeader,
} from '../server/utils/auth-env-flags'
import { isHeaderAuthConfigSufficient } from '../server/utils/header-auth'

afterEach(() => {
  delete process.env.AUTH_HEADER_ENABLED
  delete process.env.AUTH_HEADER_TRUST_WITHOUT_TOKEN
  delete process.env.AUTH_JIT_ENABLED
  delete process.env.AUTH_HEADER_USER_HEADER
  delete process.env.AUTH_HEADER_INTERNAL_TOKEN
})

describe('auth-env-flags', () => {
  it('AUTH_HEADER_ENABLED overrides DB disabled flag', () => {
    expect(resolveHeaderAuthEnabled(false)).toBe(false)
    process.env.AUTH_HEADER_ENABLED = 'true'
    expect(resolveHeaderAuthEnabled(false)).toBe(true)
  })

  it('AUTH_HEADER_TRUST_WITHOUT_TOKEN forces trust without shared secret', () => {
    expect(resolveHeaderTrustWithoutToken(true)).toBe(false)
    process.env.AUTH_HEADER_TRUST_WITHOUT_TOKEN = '1'
    expect(resolveHeaderTrustWithoutToken(true)).toBe(true)
  })

  it('AUTH_JIT_ENABLED overrides DB', () => {
    expect(resolveJitEnabled(false)).toBe(false)
    process.env.AUTH_JIT_ENABLED = 'true'
    expect(resolveJitEnabled(false)).toBe(true)
  })

  it('AUTH_HEADER_USER_HEADER overrides default', () => {
    expect(resolveHeaderUserHeader(undefined)).toBe('X-Remote-User')
    process.env.AUTH_HEADER_USER_HEADER = 'Remote-User'
    expect(resolveHeaderUserHeader('X-Forwarded-User')).toBe('Remote-User')
  })

  it('isHeaderAuthConfigSufficient respects AUTH_HEADER_ENABLED + TRUST_WITHOUT_TOKEN', () => {
    process.env.AUTH_HEADER_ENABLED = 'true'
    process.env.AUTH_HEADER_TRUST_WITHOUT_TOKEN = 'true'
    expect(isHeaderAuthConfigSufficient({
      enabled:              false,
      userHeader:           'X-Remote-User',
      emailHeader:          '',
      groupsHeader:         '',
      groupsDelimiter:      ',',
      displayNameHeader:    '',
      issuer:               'bastion-pro',
      tokenHeader:          'X-ESOS-Auth-Token',
      internalTokenSet:     false,
      requireInternalToken: true,
    })).toBe(true)
  })
})
