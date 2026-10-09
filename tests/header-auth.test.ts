import { describe, it, expect, afterEach } from 'vitest'
import { createEvent } from 'h3'
import {
  extractHeaderAuthIdentity,
  isHeaderAuthConfigSufficient,
  isPrivateOrLoopbackIp,
  verifyHeaderAuthTrust,
} from '../server/utils/header-auth'

const baseHeaderCfg = {
  enabled:              true,
  userHeader:           'X-Remote-User',
  emailHeader:          'X-Remote-Email',
  groupsHeader:         'X-Remote-Groups',
  groupsDelimiter:      ',',
  displayNameHeader:    'X-Remote-Name',
  issuer:               'bastion-pro',
  tokenHeader:          'X-ESOS-Auth-Token',
  internalTokenSet:     true,
  requireInternalToken: true,
}

function eventWithHeaders(headers: Record<string, string>) {
  return createEvent({
    method: 'GET',
    url:    '/',
    headers,
  })
}

afterEach(() => {
  delete process.env.AUTH_HEADER_INTERNAL_TOKEN
  delete process.env.AUTH_HEADER_TRUST_WITHOUT_TOKEN
})

describe('header-auth', () => {
  it('isPrivateOrLoopbackIp covers loopback and RFC1918', () => {
    expect(isPrivateOrLoopbackIp('127.0.0.1')).toBe(true)
    expect(isPrivateOrLoopbackIp('10.1.2.3')).toBe(true)
    expect(isPrivateOrLoopbackIp('172.16.0.1')).toBe(true)
    expect(isPrivateOrLoopbackIp('172.31.255.1')).toBe(true)
    expect(isPrivateOrLoopbackIp('192.168.1.230')).toBe(true)
    expect(isPrivateOrLoopbackIp('::1')).toBe(true)
    expect(isPrivateOrLoopbackIp('8.8.8.8')).toBe(false)
    expect(isPrivateOrLoopbackIp('172.32.0.1')).toBe(false)
  })

  it('isHeaderAuthConfigSufficient requires token when requireInternalToken', () => {
    delete process.env.AUTH_HEADER_INTERNAL_TOKEN
    expect(isHeaderAuthConfigSufficient(baseHeaderCfg)).toBe(true)
    expect(isHeaderAuthConfigSufficient({ ...baseHeaderCfg, enabled: false })).toBe(false)
    expect(isHeaderAuthConfigSufficient({ ...baseHeaderCfg, internalTokenSet: false })).toBe(false)
    expect(isHeaderAuthConfigSufficient({ ...baseHeaderCfg, userHeader: '  ' })).toBe(false)
  })

  it('isHeaderAuthConfigSufficient allows missing token when requireInternalToken is false', () => {
    delete process.env.AUTH_HEADER_INTERNAL_TOKEN
    expect(isHeaderAuthConfigSufficient({
      ...baseHeaderCfg,
      internalTokenSet:     false,
      requireInternalToken: false,
    })).toBe(true)
  })

  it('isHeaderAuthConfigSufficient accepts AUTH_HEADER_INTERNAL_TOKEN env without DB flag', () => {
    process.env.AUTH_HEADER_INTERNAL_TOKEN = 'from-env'
    expect(isHeaderAuthConfigSufficient({ ...baseHeaderCfg, internalTokenSet: false })).toBe(true)
  })

  it('verifyHeaderAuthTrust compares token with timing-safe hash', () => {
    const event = eventWithHeaders({ 'x-esos-auth-token': 'secret-value' })
    expect(verifyHeaderAuthTrust(event, baseHeaderCfg, 'secret-value')).toBe(true)
    expect(verifyHeaderAuthTrust(event, baseHeaderCfg, 'wrong')).toBe(false)
  })

  it('verifyHeaderAuthTrust prefers AUTH_HEADER_INTERNAL_TOKEN env', () => {
    process.env.AUTH_HEADER_INTERNAL_TOKEN = 'from-env'
    const event = eventWithHeaders({ 'x-esos-auth-token': 'from-env' })
    expect(verifyHeaderAuthTrust(event, baseHeaderCfg, 'db-token')).toBe(true)
  })

  it('extractHeaderAuthIdentity parses X-Remote-* headers', () => {
    const event = eventWithHeaders({
      'x-remote-user':  'alice',
      'x-remote-email': 'alice@example.com',
      'x-remote-groups': 'admins, operators',
      'x-remote-name':  'Alice A',
    })
    const id = extractHeaderAuthIdentity(event, baseHeaderCfg)
    expect(id).toMatchObject({
      username:    'alice',
      email:       'alice@example.com',
      groups:      ['admins', 'operators'],
      displayName: 'Alice A',
    })
  })

  it('extractHeaderAuthIdentity falls back to Remote-User / X-Forwarded-User', () => {
    const remote = eventWithHeaders({ 'remote-user': 'bob' })
    expect(extractHeaderAuthIdentity(remote, baseHeaderCfg)?.username).toBe('bob')

    const fwd = eventWithHeaders({ 'x-forwarded-user': 'carol' })
    expect(extractHeaderAuthIdentity(fwd, {
      ...baseHeaderCfg,
      userHeader: 'X-Forwarded-User',
    })?.username).toBe('carol')
  })

  it('extractHeaderAuthIdentity returns null without username', () => {
    const event = eventWithHeaders({ 'x-remote-email': 'a@b.c' })
    expect(extractHeaderAuthIdentity(event, baseHeaderCfg)).toBeNull()
  })
})
