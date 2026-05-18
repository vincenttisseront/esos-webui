import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  generatePassword,
} from '../server/utils/password'

describe('password (Argon2id)', () => {
  it('A01 — hash + verify round-trip', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple!')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassword(hash, 'CorrectHorseBatteryStaple!')).toBe(true)
  })

  it('A02 — verify rejects wrong password', async () => {
    const hash = await hashPassword('s3cret-pwd-1234')
    expect(await verifyPassword(hash, 'wrong-pwd')).toBe(false)
  })

  it('A02b — verify on garbage hash returns false', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false)
  })

  it('A03 — generatePassword length and charset', () => {
    const pwd = generatePassword(16)
    expect(pwd).toHaveLength(16)
    expect(pwd).toMatch(/^[a-zA-Z2-9!@#$]+$/)
    // Sans caractères ambigus
    expect(pwd).not.toMatch(/[01OIl]/)
  })

  it('A03b — generated passwords are different', () => {
    const a = generatePassword(20)
    const b = generatePassword(20)
    expect(a).not.toBe(b)
  })
})
