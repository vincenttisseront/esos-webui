import { and, eq, gte, isNull, lt } from 'drizzle-orm'
import { getDB } from '../index'
import { oidcAuthAttempts } from '../schema'

export type OidcAuthAttemptRow = typeof oidcAuthAttempts.$inferSelect

const ATTEMPT_TTL_MS = 15 * 60 * 1000

export function purgeExpiredOidcAttempts(): void {
  const db     = getDB()
  const cutoff = new Date(Date.now() - ATTEMPT_TTL_MS).toISOString()
  db.delete(oidcAuthAttempts).where(lt(oidcAuthAttempts.expiresAt, cutoff)).run()
}

export function insertOidcAttempt(row: {
  id: string
  stateHash: string
  nonceHash: string
  codeVerifierEncrypted: string
  nonceEncrypted: string
}): void {
  purgeExpiredOidcAttempts()
  const db  = getDB()
  const now = new Date().toISOString()
  const exp = new Date(Date.now() + ATTEMPT_TTL_MS).toISOString()
  db.insert(oidcAuthAttempts).values({
    id: row.id,
    stateHash: row.stateHash,
    nonceHash: row.nonceHash,
    codeVerifierEncrypted: row.codeVerifierEncrypted,
    nonceEncrypted: row.nonceEncrypted,
    createdAt: now,
    expiresAt: exp,
    usedAt: null,
  }).run()
}

/**
 * Atomically marks attempt used and returns row if state matches an unused row.
 */
export function consumeOidcAttempt(stateHash: string): OidcAuthAttemptRow | undefined {
  purgeExpiredOidcAttempts()
  const db  = getDB()
  const now = new Date().toISOString()

  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(oidcAuthAttempts)
      .where(
        and(
          eq(oidcAuthAttempts.stateHash, stateHash),
          isNull(oidcAuthAttempts.usedAt),
          gte(oidcAuthAttempts.expiresAt, now),
        ),
      )
      .limit(1)
      .get()

    if (!row) return undefined

    tx.update(oidcAuthAttempts)
      .set({ usedAt: now })
      .where(eq(oidcAuthAttempts.id, row.id))
      .run()

    return row
  })
}
