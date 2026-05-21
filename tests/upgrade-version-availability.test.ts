import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UpgradeNodeReadiness } from '../types/upgrade'

vi.mock('../server/utils/esos-github', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/esos-github')>()
  return {
    ...actual,
    resolveLatestStableRelease: vi.fn(),
    fetchESOSTags: vi.fn(),
  }
})

import { resolveLatestStableRelease, fetchESOSTags } from '../server/utils/esos-github'
import { buildUpgradeVersionAvailability } from '../server/utils/upgrade-version-availability'
import type { GitHubTag } from '../server/utils/types'

function node(
  sanId: string,
  installed: UpgradeNodeReadiness['installed'],
): UpgradeNodeReadiness {
  return {
    sanId,
    label: sanId,
    level: 'ready',
    checks: [],
    installed,
  }
}

function latestTag(version: string): GitHubTag {
  return {
    name: version,
    commit: { sha: 'x', url: 'https://github.com' },
    tarballUrl: '',
    zipballUrl: '',
    downloadUrl: `https://example.com/${version}.zip`,
  }
}

describe('buildUpgradeVersionAvailability', () => {
  beforeEach(() => {
    vi.mocked(resolveLatestStableRelease).mockReset()
    vi.mocked(fetchESOSTags).mockReset()
  })

  it('marks upgrade-available when installed is behind latest', async () => {
    vi.mocked(resolveLatestStableRelease).mockResolvedValue({
      ok: true,
      latest: latestTag('4.4.1'),
    })
    vi.mocked(fetchESOSTags).mockResolvedValue([
      latestTag('4.4.1'),
      latestTag('4.4.0'),
      latestTag('4.3.5'),
    ])

    const result = await buildUpgradeVersionAvailability([
      node('san-1', { raw: '4.4.0', buildType: 'stable', version: '4.4.0' }),
    ])

    expect(result.overall).toBe('upgrade-available')
    expect(result.nodes[0].status).toBe('upgrade-available')
    expect(result.nodes[0].diff).toBe('patch')
    expect(result.latestStable?.version).toBe('4.4.1')
  })

  it('marks up-to-date when versions match', async () => {
    vi.mocked(resolveLatestStableRelease).mockResolvedValue({
      ok: true,
      latest: latestTag('4.4.1'),
    })
    vi.mocked(fetchESOSTags).mockResolvedValue([latestTag('4.4.1')])

    const result = await buildUpgradeVersionAvailability([
      node('san-1', { raw: '4.4.1', buildType: 'stable', version: '4.4.1' }),
    ])

    expect(result.overall).toBe('up-to-date')
    expect(result.nodes[0].status).toBe('up-to-date')
  })

  it('marks ahead-of-release when installed is newer than GitHub latest', async () => {
    vi.mocked(resolveLatestStableRelease).mockResolvedValue({
      ok: true,
      latest: latestTag('4.4.0'),
    })
    vi.mocked(fetchESOSTags).mockResolvedValue([latestTag('4.4.0')])

    const result = await buildUpgradeVersionAvailability([
      node('san-1', { raw: '4.4.1', buildType: 'stable', version: '4.4.1' }),
    ])

    expect(result.nodes[0].status).toBe('ahead-of-release')
    expect(result.overall).toBe('up-to-date')
  })

  it('marks on-master for master builds', async () => {
    vi.mocked(resolveLatestStableRelease).mockResolvedValue({
      ok: true,
      latest: latestTag('4.4.1'),
    })
    vi.mocked(fetchESOSTags).mockResolvedValue([latestTag('4.4.1')])

    const result = await buildUpgradeVersionAvailability([
      node('san-1', { raw: 'master_abc_opts', buildType: 'master' }),
    ])

    expect(result.overall).toBe('on-master')
    expect(result.nodes[0].status).toBe('on-master')
  })

  it('marks not-comparable for unknown builds', async () => {
    vi.mocked(resolveLatestStableRelease).mockResolvedValue({
      ok: true,
      latest: latestTag('4.4.1'),
    })
    vi.mocked(fetchESOSTags).mockResolvedValue([latestTag('4.4.1')])

    const result = await buildUpgradeVersionAvailability([
      node('san-1', { raw: 'custom', buildType: 'unknown' }),
    ])

    expect(result.nodes[0].status).toBe('not-comparable')
    expect(result.overall).toBe('not-comparable')
  })

  it('sets github-unavailable when GitHub resolve fails', async () => {
    vi.mocked(resolveLatestStableRelease).mockResolvedValue({
      ok: false,
      latest: null,
      error: 'network',
      message: 'timeout',
    })

    const result = await buildUpgradeVersionAvailability([
      node('san-1', { raw: '4.4.0', buildType: 'stable', version: '4.4.0' }),
    ])

    expect(result.overall).toBe('github-unavailable')
    expect(result.githubOk).toBe(false)
    expect(result.githubError).toBe('network')
  })

  it('detects mixed cluster when nodes differ', async () => {
    vi.mocked(resolveLatestStableRelease).mockResolvedValue({
      ok: true,
      latest: latestTag('4.4.1'),
    })
    vi.mocked(fetchESOSTags).mockResolvedValue([
      latestTag('4.4.1'),
      latestTag('4.4.0'),
    ])

    const result = await buildUpgradeVersionAvailability([
      node('san-1', { raw: '4.4.1', buildType: 'stable', version: '4.4.1' }),
      node('san-2', { raw: '4.4.0', buildType: 'stable', version: '4.4.0' }),
    ])

    expect(result.overall).toBe('mixed')
    expect(result.nodes[0].status).toBe('up-to-date')
    expect(result.nodes[1].status).toBe('upgrade-available')
  })
})
