interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

/**
 * Simple in-memory TTL cache (cf. SDD v1.2 §11).
 */
export function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const entry = store.get(key) as CacheEntry<T> | undefined
  if (entry && Date.now() < entry.expiresAt) {
    return Promise.resolve(entry.data)
  }
  return fn().then((data) => {
    store.set(key, { data, expiresAt: Date.now() + ttlMs })
    return data
  })
}

export function invalidateCache(key?: string): void {
  if (key) store.delete(key)
  else store.clear()
}

export function invalidateCacheKey(key: string): void {
  invalidateCache(key)
}
