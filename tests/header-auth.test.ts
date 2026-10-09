import { describe, it, expect } from 'vitest'
import { createEvent } from 'h3'
import {
  extractHeaderAuthIdentity,
  isHeaderAuthConfigSufficient,
  verifyHeaderAuthTrust,
} from '../server/utils/header-auth'

const baseHeaderCfg = {
  enabled:           true,
  userHeader:        'X-Forwarded-User',
  emailHeader:       'X-Forwarded-Email',
  groupsHeader:      'X-Forwarded-Groups',
  groupsDelimiter:   ',',
  displayNameHeader: 'X-Forwarded-Preferred-Username',
  issuer:            'bastion-pro',
  tokenHeader:       'X-ESOS-Auth-Token',
  internalTokenSet:  true,
}

function eventWithHeaders(headers: Record<string, string>) {
  return createEvent({
    method: 'GET',
    url:    '/',
    headers,
  })
}

describe('header-auth', () => {
  it('isHeaderAuthConfigSufficient requires enabled config and secret flag', () => {
    const prev = process.env.AUTH_HEADER_INTERNAL_TOKEN
    delete process.env.AUTH_HEADER_INTERNAL_TOKEN
    expect(isHeaderAuthConfigSufficient(baseHeaderCfg)).toBe(true)
    expect(isHeaderAuthConfigSufficient({ ...baseHeaderCfg, enabled: false })).toBe(false)
    expect(isHeaderAuthConfigSufficient({ ...baseHeaderCfg, internalTokenSet: false })).toBe(false)
    expect(isHeaderAuthConfigSufficient({ ...baseHeaderCfg, userHeader: '  ' })).toBe(false)
    if (prev !== undefined) process.env.AUTH_HEADER_INTERNAL_TOKEN = prev
  })

  it('isHeaderAuthConfigSufficient accepts AUTH_HEADER_INTERNAL_TOKEN env without DB flag', () => {
    process.env.AUTH_HEADER_INTERNAL_TOKEN = 'from-env'
    expect(isHeaderAuthConfigSufficient({ ...baseHeaderCfg, internalTokenSet: false })).toBe(true)
    delete process.env.AUTH_HEADER_INTERNAL_TOKEN
  })

  it('verifyHeaderAuthTrust compares token with timing-safe hash', () => {
    const prev = process.env.AUTH_HEADER_INTERNAL_TOKEN
    delete process.env.AUTH_HEADER_INTERNAL_TOKEN
    const event = eventWithHeaders({ 'x-esos-auth-token': 'secret-value' })
    expect(verifyHeaderAuthTrust(event, baseHeaderCfg, 'secret-value')).toBe(true)
    expect(verifyHeaderAuthTrust(event, baseHeaderCfg, 'wrong')).toBe(false)
    if (prev !== undefined) process.env.AUTH_HEADER_INTERNAL_TOKEN = prev
  })

  it('verifyHeaderAuthTrust prefers AUTH_HEADER_INTERNAL_TOKEN env', () => {
    process.env.AUTH_HEADER_INTERNAL_TOKEN = 'from-env'
    const event = eventWithHeaders({ 'x-esos-auth-token': 'from-env' })
    expect(verifyHeaderAuthTrust(event, baseHeaderCfg, 'db-token')).toBe(true)
    delete process.env.AUTH_HEADER_INTERNAL_TOKEN
  })

  it('extractHeaderAuthIdentity parses user, email, and groups', () => {
    const event = eventWithHeaders({
      'x-forwarded-user': 'alice',
      'x-forwarded-email': 'alice@example.com',
      'x-forwarded-groups': 'admins, operators',
      'x-forwarded-preferred-username': 'Alice A',
    })
    const id = extractHeaderAuthIdentity(event, baseHeaderCfg)
    expect(id).toMatchObject({
      username: 'alice',
      email:    'alice@example.com',
      groups:   ['admins', 'operators'],
      displayName: 'Alice A',
    })
    expect(id?.claims.groups).toEqual(['admins', 'operators'])
  })

  it('extractHeaderAuthIdentity returns null without username', () => {
    const event = eventWithHeaders({ 'x-forwarded-email': 'a@b.c' })
    expect(extractHeaderAuthIdentity(event, baseHeaderCfg)).toBeNull()
  })
})
