import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encrypt, decrypt, generateEncryptionKey } from '../server/utils/crypto'

describe('crypto AES-256-GCM (SDD v2.0 §6 / §17 D01-D02)', () => {
  const ORIGINAL = process.env.NUXT_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.NUXT_ENCRYPTION_KEY = generateEncryptionKey()
  })

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NUXT_ENCRYPTION_KEY
    else process.env.NUXT_ENCRYPTION_KEY = ORIGINAL
  })

  it('D01: round-trip encrypt → decrypt restitue le plaintext', () => {
    const plain = '-----BEGIN OPENSSH PRIVATE KEY-----\nABCDEF\n-----END...-----'
    const cipher = encrypt(plain)
    expect(cipher).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)
    expect(decrypt(cipher)).toBe(plain)
  })

  it('D01b: deux chiffrements du même plaintext donnent des ciphertexts différents (IV aléatoire)', () => {
    const plain = 'secret'
    expect(encrypt(plain)).not.toBe(encrypt(plain))
  })

  it('D02: déchiffrer avec une mauvaise clé lève une erreur', () => {
    const plain = 'secret'
    const cipher = encrypt(plain)
    process.env.NUXT_ENCRYPTION_KEY = generateEncryptionKey()
    expect(() => decrypt(cipher)).toThrow()
  })

  it('rejette un format ciphertext invalide', () => {
    expect(() => decrypt('not-a-valid-format')).toThrow(/Format/)
  })
})
