const NPM_REGISTRY = 'https://registry.npmjs.org'
const FETCH_TIMEOUT = 8_000
const BATCH_SIZE = 10

interface NpmLatestResponse {
  name: string
  version: string
  description?: string
  time?: Record<string, string>
  repository?: { url?: string }
  homepage?: string
}

export interface NpmLatestInfo {
  version: string
  publishedAt: string | null
  repoUrl: string | null
  description: string
}

export async function fetchLatestVersion(name: string): Promise<NpmLatestInfo> {
  const url = `${NPM_REGISTRY}/${encodeURIComponent(name)}/latest`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      return { version: 'unknown', publishedAt: null, repoUrl: null, description: '' }
    }

    const data: NpmLatestResponse = await res.json()

    let repoUrl: string | null = null
    if (data.repository?.url) {
      repoUrl = data.repository.url
        .replace(/^git\+/, '')
        .replace(/^git:\/\//, 'https://')
        .replace(/\.git$/, '')
    } else if (data.homepage?.includes('github.com')) {
      repoUrl = data.homepage.replace(/#readme$/, '')
    }

    const publishedAt = data.time?.[data.version] ?? null

    return {
      version: data.version,
      publishedAt,
      repoUrl,
      description: data.description ?? '',
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { version: 'timeout', publishedAt: null, repoUrl: null, description: '' }
    }
    return { version: 'error', publishedAt: null, repoUrl: null, description: '' }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchAllLatestVersions(
  packages: Array<{ name: string }>,
): Promise<Map<string, NpmLatestInfo>> {
  const results = new Map<string, NpmLatestInfo>()

  for (let i = 0; i < packages.length; i += BATCH_SIZE) {
    const batch = packages.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (p) => ({ name: p.name, data: await fetchLatestVersion(p.name) })),
    )

    for (const { name, data } of batchResults) {
      results.set(name, data)
    }
  }

  return results
}
