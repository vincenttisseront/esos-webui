import argon2 from 'argon2'
import { randomBytes } from 'node:crypto'

/**
 * Hashage de mots de passe avec Argon2id (cf. SDD v2.1 §5).
 * Paramètres OWASP 2024 : 64 MiB, 3 itérations, parallélisme 4.
 */

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

/**
 * Génère un mot de passe aléatoire lisible (sans caractères ambigus
 * comme 0/O, 1/l/I).
 */
export function generatePassword(length = 16): string {
  const charset =
    'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += charset[bytes[i] % charset.length]
  }
  return out
}
