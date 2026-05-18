import { createError, getQuery, type H3Event } from 'h3'
import { getAllSans } from '../db/repositories/san.repository'
import { withSanContext } from './ssh-runtime'

const MULTI_SAN_READ_MESSAGE = 'sanId is required when multiple SANs are configured'

/** Optional `?sanId=` from query: trimmed non-empty string, else null. */
export function parseOptionalSanIdQuery(event: H3Event): string | null {
  const q = getQuery(event) as { sanId?: unknown }
  const raw = q.sanId
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  return t || null
}

/** DB rows with `status === 'active'`. Empty array if DB unavailable. */
export function getActiveSans() {
  try {
    return getAllSans().filter((s) => s.status === 'active')
  } catch {
    return []
  }
}

/**
 * Resolves which SAN to scope read-only SSH work to.
 * - Explicit `?sanId=` always wins (caller should still validate pool membership elsewhere if needed).
 * - Exactly one active SAN: returns that id (implicit scope).
 * - Zero active SANs: returns null (v1 singleton / env SSH — use bare `getActiveSSHManager()`).
 * - More than one active SAN and no explicit sanId: throws 400.
 */
export function resolveScopedSanIdForRead(event: H3Event): string | null {
  const explicit = parseOptionalSanIdQuery(event)
  const active = getActiveSans()
  if (active.length > 1 && !explicit) {
    throw createError({ statusCode: 400, statusMessage: MULTI_SAN_READ_MESSAGE })
  }
  if (explicit) return explicit
  if (active.length === 1) return active[0].id
  return null
}

/**
 * Runs `fn` under `withSanContext` when a SAN id is resolved; otherwise runs `fn` (v1 / no SAN rows).
 */
export function runReadWithSanScope<T>(event: H3Event, fn: () => Promise<T>): Promise<T> {
  const id = resolveScopedSanIdForRead(event)
  if (id) return withSanContext(id, fn)
  return fn()
}

/** Bucket key for in-memory stats when no resolved SAN (v1). */
export function defaultStatsBucketSanId(): string {
  return process.env.DEFAULT_SAN_ID ?? '__default__'
}
