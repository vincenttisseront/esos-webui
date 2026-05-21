/**
 * Server-side cache with in-flight deduplication, stale-if-error, and fetch metadata.
 */

export type CacheSource = 'live' | 'cache' | 'stale'

export interface CacheFetchMeta {
  source: CacheSource
  fetchedAt: number
  error?: string
}

export interface CachedResult<T> {
  value: T
  meta: CacheFetchMeta
}

interface CacheEnvelope<T> {
  data: T
  fetchedAt: number
  expiresAt: number
  staleUntil: number
}

const envelopes = new Map<string, CacheEnvelope<unknown>>()
const inFlight = new Map<string, Promise<CachedResult<unknown>>>()

const DEFAULT_STALE_GRACE_MS = 7 * 24 * 60 * 60 * 1000 // 7d

function debugLog(message: string): void {
  if (process.env.NUXT_DEBUG_CACHE === '1') {
    console.debug(`[serverCache] ${message}`)
  }
}

export function getCacheEnvelope<T>(key: string): CacheEnvelope<T> | undefined {
  return envelopes.get(key) as CacheEnvelope<T> | undefined
}

export function invalidateServerCacheKey(key: string): void {
  envelopes.delete(key)
  inFlight.delete(key)
}

export function invalidateServerCache(): void {
  envelopes.clear()
  inFlight.clear()
}

export interface CachedFetchOptions {
  ttlMs: number
  staleGraceMs?: number
  forceRefresh?: boolean
  /** Return stale envelope on fetch failure when within staleGrace */
  staleIfError?: boolean
}

/**
 * Fetch with TTL cache, in-flight coalescing, and optional stale-if-error.
 */
export async function cachedFetch<T>(
  key: string,
  fn: () => Promise<T>,
  options: CachedFetchOptions,
): Promise<CachedResult<T>> {
  const {
    ttlMs,
    staleGraceMs = DEFAULT_STALE_GRACE_MS,
    forceRefresh = false,
    staleIfError = true,
  } = options

  const now = Date.now()
  const existing = envelopes.get(key) as CacheEnvelope<T> | undefined

  if (!forceRefresh && existing && now < existing.expiresAt) {
    debugLog(`hit key=${key}`)
    return {
      value: existing.data,
      meta: { source: 'cache', fetchedAt: existing.fetchedAt },
    }
  }

  const pending = inFlight.get(key) as Promise<CachedResult<T>> | undefined
  if (pending) {
    debugLog(`in-flight key=${key}`)
    return pending
  }

  const promise = (async (): Promise<CachedResult<T>> => {
    try {
      debugLog(`miss key=${key}`)
      const data = await fn()
      const fetchedAt = Date.now()
      envelopes.set(key, {
        data,
        fetchedAt,
        expiresAt: fetchedAt + ttlMs,
        staleUntil: fetchedAt + staleGraceMs,
      })
      return { value: data, meta: { source: 'live', fetchedAt } }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fetch failed'
      const prev = envelopes.get(key) as CacheEnvelope<T> | undefined
      if (staleIfError && prev && now < prev.staleUntil) {
        debugLog(`stale key=${key} err=${message}`)
        return {
          value: prev.data,
          meta: { source: 'stale', fetchedAt: prev.fetchedAt, error: message },
        }
      }
      throw err
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, promise as Promise<CachedResult<unknown>>)
  return promise
}

/**
 * Store a failed fetch result as stale envelope when caller handles errors externally
 * (e.g. GitHub rate limit returning structured error + last good value).
 */
export function storeStaleEnvelope<T>(key: string, data: T, ttlMs: number, staleGraceMs?: number): void {
  const fetchedAt = Date.now()
  envelopes.set(key, {
    data,
    fetchedAt,
    expiresAt: fetchedAt + ttlMs,
    staleUntil: fetchedAt + (staleGraceMs ?? DEFAULT_STALE_GRACE_MS),
  })
}

export function resolveWithStaleIfError<T>(
  key: string,
  live: T,
  isFailure: boolean,
  ttlMs: number,
): CachedResult<T> {
  const existing = envelopes.get(key) as CacheEnvelope<T> | undefined
  const now = Date.now()

  if (!isFailure) {
    const fetchedAt = Date.now()
    envelopes.set(key, {
      data: live,
      fetchedAt,
      expiresAt: fetchedAt + ttlMs,
      staleUntil: fetchedAt + DEFAULT_STALE_GRACE_MS,
    })
    return { value: live, meta: { source: 'live', fetchedAt } }
  }

  if (existing && now < existing.staleUntil) {
    debugLog(`stale-fallback key=${key}`)
    return {
      value: existing.data,
      meta: { source: 'stale', fetchedAt: existing.fetchedAt, error: 'upstream_failure' },
    }
  }

  const fetchedAt = Date.now()
  envelopes.set(key, {
    data: live,
    fetchedAt,
    expiresAt: fetchedAt + ttlMs,
    staleUntil: fetchedAt + DEFAULT_STALE_GRACE_MS,
  })
  return { value: live, meta: { source: 'live', fetchedAt } }
}
