import { withCache } from './cache'
import type { GitHubTag } from './types'

const GITHUB_API    = 'https://api.github.com/repos/quantum/esos'
const FETCH_TIMEOUT = 10_000
const CACHE_TTL     = 6 * 60 * 60 * 1000 // 6h

function getBaseHeaders(): Record<string, string> {
  const token = process.env.NUXT_GITHUB_TOKEN ?? ''
  return {
    'Accept':     'application/vnd.github.v3+json',
    'User-Agent': 'esos-webui/1.0',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
  try {
    return await fetch(url, { headers: getBaseHeaders(), signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchESOSTags(): Promise<GitHubTag[]> {
  return withCache('esos-github-tags', CACHE_TTL, async () => {
    const res = await fetchWithTimeout(`${GITHUB_API}/tags?per_page=30`)
    if (!res.ok) {
      console.warn(`[esos-github] GitHub API error ${res.status} — returning empty tag list`)
      return []
    }

    const raw: Array<{
      name: string
      commit: { sha: string; url: string }
      zipball_url: string
      tarball_url: string
    }> = await res.json()

    // Récupérer les dates de commit en parallèle par batch de 5
    const tags: GitHubTag[] = []
    for (let i = 0; i < raw.length; i += 5) {
      const batch    = raw.slice(i, i + 5)
      const enriched = await Promise.all(batch.map(enrichTag))
      tags.push(...enriched)
    }

    return tags
  })
}

async function enrichTag(raw: {
  name: string
  commit: { sha: string; url: string }
  zipball_url: string
  tarball_url: string
}): Promise<GitHubTag> {
  let publishedAt: string | null = null

  try {
    const commitRes = await fetchWithTimeout(raw.commit.url)
    if (commitRes.ok) {
      const data = await commitRes.json()
      publishedAt = data?.commit?.author?.date ?? null
    }
  } catch { /* best effort */ }

  return {
    name:        raw.name,
    sha:         raw.commit.sha.slice(0, 7),
    publishedAt,
    zipUrl:      raw.zipball_url,
    tarUrl:      raw.tarball_url,
    downloadUrl: buildDownloadUrl(raw.name),
  }
}

function buildDownloadUrl(tag: string): string {
  const major  = parseInt(tag.split('.')[0], 10)
  const branch = `${major}.x.x`
  return `https://download.esos-project.com/${branch}/esos-${tag}.zip`
}
