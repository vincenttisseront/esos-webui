import { describe, it, expect, beforeEach } from 'vitest'
import { SignJWT } from 'jose'
import { signSession, verifySession } from '../server/utils/jwt'

const TEST_SECRET = 'a'.repeat(64)

beforeEach(() => {
  process.env.NUXT_JWT_SECRET = TEST_SECRET
})

describe('jwt (jose / HS256)', () => {
  it('A04 — sign + verify round-trip', async () => {
    const token = await signSession({
      userId: 'u1',
      username: 'admin',
      role: 'admin',
    })
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)

    const payload = await verifySession(token)
    expect(payload.userId).toBe('u1')
    expect(payload.username).toBe('admin')
    expect(payload.role).toBe('admin')
  })

  it('A05 — expired token throws', async () => {
    const expired = await new SignJWT({ userId: 'u1', username: 'admin', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(TEST_SECRET))

    await expect(verifySession(expired)).rejects.toThrow()
  })

  it('A05b — secret too short throws on sign', async () => {
    process.env.NUXT_JWT_SECRET = 'short'
    await expect(
      signSession({ userId: 'u1', username: 'admin', role: 'admin' }),
    ).rejects.toThrow(/NUXT_JWT_SECRET/)
  })

  it('A05c — token signed with another secret rejected', async () => {
    const other = await new SignJWT({ userId: 'u1', username: 'admin', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('b'.repeat(64)))

    await expect(verifySession(other)).rejects.toThrow()
  })
})
