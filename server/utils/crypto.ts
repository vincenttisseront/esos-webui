import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  createHash,
} from 'node:crypto'

/**
 * AES-256-GCM encryption for sensitive credentials at rest
 * (cf. SDD v2.0 §6).
 */

const ALGORITHM = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 12

function getMasterKey(): string {
  const key = process.env.NUXT_ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      'NUXT_ENCRYPTION_KEY non défini. Générez-en une avec : ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  return key
}

function deriveKey(masterKey: string): Buffer {
  return scryptSync(masterKey, 'esos-webui-salt-v1', KEY_LEN)
}

export function encrypt(plaintext: string): string {
  const key = deriveKey(getMasterKey())
  const iv = randomBytes(IV_LEN)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encHex) {
    throw new Error('Format ciphertext invalide')
  }

  const key = deriveKey(getMasterKey())
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return (
    decipher.update(encrypted).toString('utf-8') + decipher.final('utf-8')
  )
}

/**
 * Calcule un fingerprint SHA-256 d'une clé publique/privée pour
 * affichage UI (non sensible). Si la clé est privée, on hashe le
 * matériel brut — ce qui suffit pour comparer/identifier l'origine.
 */
export function computeKeyFingerprint(material: string): string {
  return 'SHA256:' + createHash('sha256').update(material).digest('base64')
}

export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex')
}
