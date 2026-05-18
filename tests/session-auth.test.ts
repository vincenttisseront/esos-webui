/**
 * Session cookie parsing + terminal WS role policy (Batch 2B.6).
 */
import { describe, it, expect } from 'vitest'
import {
  extractSessionTokenFromCookieHeader,
  isTerminalWebSocketRoleAllowed,
} from '../server/utils/session-auth'

describe('extractSessionTokenFromCookieHeader', () => {
  it('returns undefined for empty header', () => {
    expect(extractSessionTokenFromCookieHeader(undefined, 'esos_session')).toBeUndefined()
    expect(extractSessionTokenFromCookieHeader('', 'esos_session')).toBeUndefined()
  })

  it('extracts esos_session from a typical Cookie header', () => {
    const h = 'foo=bar; esos_session=abc.def.ghi; other=1'
    expect(extractSessionTokenFromCookieHeader(h, 'esos_session')).toBe('abc.def.ghi')
  })

  it('trims name and value segments', () => {
    const h = '  esos_session  =  tokenValue  ; x=1'
    expect(extractSessionTokenFromCookieHeader(h, 'esos_session')).toBe('tokenValue')
  })

  it('returns undefined when cookie name missing', () => {
    expect(extractSessionTokenFromCookieHeader('a=b', 'esos_session')).toBeUndefined()
  })
})

describe('isTerminalWebSocketRoleAllowed', () => {
  it('allows admin and operator', () => {
    expect(isTerminalWebSocketRoleAllowed('admin')).toBe(true)
    expect(isTerminalWebSocketRoleAllowed('operator')).toBe(true)
  })

  it('denies viewer', () => {
    expect(isTerminalWebSocketRoleAllowed('viewer')).toBe(false)
  })
})
