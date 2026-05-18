import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const expectedPackageCount =
  Object.keys(packageJson.dependencies ?? {}).length +
  Object.keys(packageJson.devDependencies ?? {}).length

function makeLatestMap(packages: Array<{ name: string }>) {
  return new Map(
    packages.map((pkg) => [
      pkg.name,
      {
        version: '9.9.9',
        publishedAt: '2026-05-03T00:00:00.000Z',
        repoUrl: `https://github.com/test/${pkg.name.replace('/', '-')}`,
        description: `${pkg.name} package`,
      },
    ]),
  )
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  const cache = await import('../server/utils/cache')
  cache.invalidateCache()
})

describe('npm-registry', () => {
  it('DEP08 - fetchLatestVersion returns a valid semver from mocked npm registry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'vue',
          version: '3.4.21',
          description: 'The progressive JavaScript framework',
          time: {
            '3.4.21': '2024-03-18T12:00:00.000Z',
          },
          repository: {
            url: 'git+https://github.com/vuejs/core.git',
          },
        }),
      }),
    )

    const { fetchLatestVersion } = await import('../server/utils/npm-registry')
    const result = await fetchLatestVersion('vue')

    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(result.publishedAt).toBe('2024-03-18T12:00:00.000Z')
    expect(result.repoUrl).toBe('https://github.com/vuejs/core')
  })

  it('DEP09 - fetchLatestVersion returns unknown for a missing package', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    )

    const { fetchLatestVersion } = await import('../server/utils/npm-registry')
    const result = await fetchLatestVersion('@fake/pkg')

    expect(result).toEqual({
      version: 'unknown',
      publishedAt: null,
      repoUrl: null,
      description: '',
    })
  })
})

describe('deps-reader', () => {
  it('DEP10 - buildDependenciesReport returns as many packages as package.json declares', async () => {
    vi.doMock('../server/utils/npm-registry', () => ({
      fetchAllLatestVersions: vi.fn(async (packages: Array<{ name: string }>) => makeLatestMap(packages)),
    }))

    const cache = await import('../server/utils/cache')
    cache.invalidateCache()

    const { buildDependenciesReport } = await import('../server/utils/deps-reader')
    const report = await buildDependenciesReport()

    expect(report.totalCount).toBe(expectedPackageCount)
    expect(report.packages).toHaveLength(expectedPackageCount)
  })

  it('DEP11 - cache avoids refetching npm data on a second call within TTL', async () => {
    const fetchAllLatestVersions = vi.fn(async (packages: Array<{ name: string }>) => makeLatestMap(packages))

    vi.doMock('../server/utils/npm-registry', () => ({
      fetchAllLatestVersions,
    }))

    const cache = await import('../server/utils/cache')
    cache.invalidateCache()

    const { buildDependenciesReport } = await import('../server/utils/deps-reader')

    await buildDependenciesReport()
    await buildDependenciesReport()

    expect(fetchAllLatestVersions).toHaveBeenCalledTimes(1)
  })
})

describe('dependencies API', () => {
  it('DEP12 - refresh=1 invalidates cache and forces a new fetch cycle', async () => {
    const fetchAllLatestVersions = vi.fn(async (packages: Array<{ name: string }>) => makeLatestMap(packages))

    vi.doMock('../server/utils/npm-registry', () => ({
      fetchAllLatestVersions,
    }))

    vi.doMock('h3', () => ({
      defineEventHandler: (fn: unknown) => fn,
      getQuery: () => ({ refresh: '1' }),
      createError: ({ statusMessage, message, statusCode }: { statusMessage?: string; message?: string; statusCode?: number }) => {
        const error = new Error(statusMessage ?? message ?? 'error')
        ;(error as Error & { statusCode?: number }).statusCode = statusCode
        return error
      },
    }))

    const cache = await import('../server/utils/cache')
    cache.invalidateCache()

    const { buildDependenciesReport } = await import('../server/utils/deps-reader')
    await buildDependenciesReport()
    expect(fetchAllLatestVersions).toHaveBeenCalledTimes(1)

    const handler = (await import('../server/api/admin/dependencies.get')).default as (event: unknown) => Promise<unknown>
    const result = await handler({})

    expect(fetchAllLatestVersions).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ totalCount: expectedPackageCount })
  })
})
