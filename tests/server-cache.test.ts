import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  cachedFetch,
  invalidateServerCache,
  getCacheEnvelope,
} from '../server/utils/server-cache'

describe('server-cache', () => {
  beforeEach(() => {
    invalidateServerCache()
    vi.useFakeTimers()
  })

  it('runs fn once within TTL', async () => {
    const fn = vi.fn(async () => 'a')
    await cachedFetch('k1', fn, { ttlMs: 60_000 })
    const second = await cachedFetch('k1', fn, { ttlMs: 60_000 })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(second.value).toBe('a')
    expect(second.meta.source).toBe('cache')
  })

  it('deduplicates concurrent fetches', async () => {
    let resolve!: (v: string) => void
    const fn = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r
        }),
    )
    const p1 = cachedFetch('k2', fn, { ttlMs: 60_000 })
    const p2 = cachedFetch('k2', fn, { ttlMs: 60_000 })
    resolve('ok')
    const [a, b] = await Promise.all([p1, p2])
    expect(fn).toHaveBeenCalledTimes(1)
    expect(a.value).toBe('ok')
    expect(b.value).toBe('ok')
  })

  it('returns stale envelope on error when prior data exists', async () => {
    const ok = vi.fn(async () => ({ n: 1 }))
    await cachedFetch('k3', ok, { ttlMs: 1 })
    vi.advanceTimersByTime(5)

    const bad = vi.fn(async () => {
      throw new Error('rate limit')
    })
    const result = await cachedFetch('k3', bad, {
      ttlMs: 60_000,
      staleIfError: true,
    })
    expect(result.meta.source).toBe('stale')
    expect(result.value).toEqual({ n: 1 })
    expect(getCacheEnvelope('k3')?.data).toEqual({ n: 1 })
  })
})
