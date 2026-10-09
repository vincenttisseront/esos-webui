import { describe, it, expect } from 'vitest'
import {
  classifyOidcDiscoveryError,
  normalizeOidcIssuer,
  oidcDiscoveryUrl,
  oidcDiscoveryErrorI18nKey,
  oidcDiscoveryHintI18nKey,
} from '../utils/oidc-discovery-errors'

describe('oidc-discovery-errors', () => {
  it('normalizeOidcIssuer strips trailing slashes', () => {
    expect(normalizeOidcIssuer(' https://idp.example/realms/x/ ')).toBe('https://idp.example/realms/x')
    expect(normalizeOidcIssuer('https://idp.example/realms/x///')).toBe('https://idp.example/realms/x')
  })

  it('oidcDiscoveryUrl builds well-known path', () => {
    expect(oidcDiscoveryUrl('https://idp.example/realms/x/')).toBe(
      'https://idp.example/realms/x/.well-known/openid-configuration',
    )
  })

  it('classifies issuer mismatch with expected/discovered from ClientError cause', () => {
    const err = Object.assign(new Error('discovered metadata issuer does not match the expected issuer'), {
      cause: {
        expected: 'https://keycloak.example/realms/X/',
        body:     { issuer: 'https://keycloak.example/realms/X' },
        attribute: 'issuer',
      },
    })
    const r = classifyOidcDiscoveryError(err, 'https://keycloak.example/realms/X/')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('issuer_mismatch')
    expect(r.expectedIssuer).toBe('https://keycloak.example/realms/X')
    expect(r.discoveredIssuer).toBe('https://keycloak.example/realms/X')
    expect(r.discoveryUrl).toContain('/.well-known/openid-configuration')
    expect(oidcDiscoveryErrorI18nKey(r.code)).toContain('issuer_mismatch')
    expect(oidcDiscoveryHintI18nKey(r.code)).toContain('issuer_mismatch_hint')
  })

  it('classifies unexpected HTTP status with Response cause', () => {
    const err = Object.assign(
      new Error('"response" is not a conform Authorization Server Metadata response (unexpected HTTP status code)'),
      { cause: { status: 404 } },
    )
    const r = classifyOidcDiscoveryError(err, 'https://keycloak.example/admin/master/console')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('http_status')
    expect(r.httpStatus).toBe(404)
    expect(oidcDiscoveryHintI18nKey(r.code)).toContain('http_status_hint')
  })

  it('classifies network and timeout errors', () => {
    expect(classifyOidcDiscoveryError(new Error('fetch failed')).code).toBe('network')
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    expect(classifyOidcDiscoveryError(timeout).code).toBe('timeout')
  })

  it('falls back to unknown', () => {
    const r = classifyOidcDiscoveryError(new Error('something odd'))
    expect(r.code).toBe('unknown')
    expect(oidcDiscoveryHintI18nKey(r.code)).toBeNull()
  })
})
