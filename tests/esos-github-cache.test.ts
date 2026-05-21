import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invalidateServerCache } from '../server/utils/server-cache'

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}))

vi.stubGlobal('fetch', fetchMock)

describe('esos-github cache', () => {
  beforeEach(async () => {
    vi.resetModules()
    invalidateServerCache()
    fetchMock.mockReset()
    const { invalidateGitHubCaches } = await import('../server/utils/esos-github')
    invalidateGitHubCaches()
  })

  it('resolveLatestStableRelease uses cache on second call', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: '4.4.1' }),
    })

    const { resolveLatestStableRelease } = await import('../server/utils/esos-github')
    const first = await resolveLatestStableRelease()
    const second = await resolveLatestStableRelease()

    expect(first.ok).toBe(true)
    expect(first.latest?.name).toBe('4.4.1')
    expect(second.meta?.source).toBe('cache')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fetchESOSTagsLite does not call commit URLs', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          name: '4.4.1',
          commit: { sha: 'abc1234567890', url: 'https://api.github.com/repos/x/commits/abc' },
          zipball_url: 'https://z',
          tarball_url: 'https://t',
        },
        {
          name: '4.4.0',
          commit: { sha: 'def1234567890', url: 'https://api.github.com/repos/x/commits/def' },
          zipball_url: 'https://z2',
          tarball_url: 'https://t2',
        },
      ],
    })

    const { fetchESOSTagsLite } = await import('../server/utils/esos-github')
    const result = await fetchESOSTagsLite()
    expect(result.tags.map(t => t.name).slice(0, 2)).toEqual(['4.4.1', '4.4.0'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const urls = fetchMock.mock.calls.map(c => String(c[0]))
    expect(urls.every(u => !u.includes('/commits/'))).toBe(true)
  })
})
