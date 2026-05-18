import { createError, getQuery, type H3Event } from 'h3'

const MISSING_SAN_ID =
  'Paramètre requis : sanId (query ?sanId=)'

/**
 * Returns a non-empty `sanId` from the request query string.
 * Used by mutating RAID/perf routes so SSH work is never routed via
 * context-less `getActiveSSHManager()` fallback.
 */
export function requireSanIdQuery(event: H3Event): string {
  const q = getQuery(event) as { sanId?: unknown }
  const raw = q.sanId
  if (typeof raw !== 'string') {
    throw createError({ statusCode: 400, statusMessage: MISSING_SAN_ID })
  }
  const sanId = raw.trim()
  if (!sanId) {
    throw createError({ statusCode: 400, statusMessage: MISSING_SAN_ID })
  }
  return sanId
}
