import { withCache } from './cache'
import { parseSemver, compareSemverOrder } from './semver'
import type { GitHubTag } from './types'

const GITHUB_API    = 'https://api.github.com/repos/quantum/esos'
const FETCH_TIMEOUT = 10_000
const CACHE_TTL     = 6 * 60 * 60 * 1000 // 6h

const SEMVER_TAG_RE = /^(\d+\.\d+\.\d+)$/

export type GitHubReleaseErrorCode =
  | 'rate_limit'
  | 'network'
  | 'http_error'
  | 'no_semver_tags'

export interface GitHubReleaseResolveResult {
  ok: boolean
  latest: GitHubTag | null
  error?: GitHubReleaseErrorCode
  httpStatus?: number
  message?: string
}

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

export function isSemverTagName(name: string): boolean {
  return SEMVER_TAG_RE.test(cleanTagName(name))
}

export function cleanTagName(name: string): string {
  return name.replace(/^v/i, '').trim()
}

export function filterSemverTags(tags: GitHubTag[]): GitHubTag[] {
  return tags.filter(t => isSemverTagName(t.name))
}

export function sortSemverTagsDesc(tags: GitHubTag[]): GitHubTag[] {
  return [...tags].sort((a, b) => {
    const order = compareSemverOrder(b.name, a.name)
    if (order === null) return 0
    return order
  })
}

export function pickLatestSemverTag(tags: GitHubTag[]): GitHubTag | null {
  const semver = sortSemverTagsDesc(filterSemverTags(tags))
  return semver[0] ?? null
}

function classifyFetchError(err: unknown, res?: Response): GitHubReleaseResolveResult {
  if (res?.status === 403) {
    return {
      ok: false,
      latest: null,
      error: 'rate_limit',
      httpStatus: 403,
      message: 'GitHub API rate limit',
    }
  }
  if (res && !res.ok) {
    return {
      ok: false,
      latest: null,
      error: 'http_error',
      httpStatus: res.status,
      message: `GitHub HTTP ${res.status}`,
    }
  }
  const msg = err instanceof Error ? err.message : 'Network error'
  return {
    ok: false,
    latest: null,
    error: 'network',
    message: msg,
  }
}

function tagFromReleaseName(tagName: string): GitHubTag | null {
  const name = cleanTagName(tagName)
  if (!parseSemver(name)) return null
  return {
    name,
    sha:         '',
    publishedAt: null,
    zipUrl:      '',
    tarUrl:      '',
    downloadUrl: buildDownloadUrl(name),
  }
}

async function fetchLatestFromReleasesApi(): Promise<GitHubReleaseResolveResult> {
  try {
    const res = await fetchWithTimeout(`${GITHUB_API}/releases/latest`)
    if (!res.ok) {
      if (res.status === 404) {
        return { ok: false, latest: null, error: 'http_error', httpStatus: 404, message: 'No releases' }
      }
      return classifyFetchError(undefined, res)
    }
    const data = await res.json() as { tag_name?: string }
    const tagName = data?.tag_name
    if (!tagName) {
      return { ok: false, latest: null, error: 'http_error', message: 'Missing tag_name' }
    }
    const latest = tagFromReleaseName(tagName)
    if (!latest) {
      return { ok: false, latest: null, error: 'no_semver_tags', message: `Non-semver release tag: ${tagName}` }
    }
    return { ok: true, latest }
  } catch (err) {
    return classifyFetchError(err)
  }
}

async function fetchLatestFromTagsApi(): Promise<GitHubReleaseResolveResult> {
  try {
    const res = await fetchWithTimeout(`${GITHUB_API}/tags?per_page=100`)
    if (!res.ok) return classifyFetchError(undefined, res)

    const raw: Array<{
      name: string
      commit: { sha: string; url: string }
      zipball_url: string
      tarball_url: string
    }> = await res.json()

    const tags: GitHubTag[] = []
    for (let i = 0; i < raw.length; i += 5) {
      const batch    = raw.slice(i, i + 5)
      const enriched = await Promise.all(batch.map(enrichTag))
      tags.push(...enriched)
    }

    const latest = pickLatestSemverTag(tags)
    if (!latest) {
      return { ok: false, latest: null, error: 'no_semver_tags', message: 'No semver tags found' }
    }
    return { ok: true, latest }
  } catch (err) {
    return classifyFetchError(err)
  }
}

export async function resolveLatestStableRelease(): Promise<GitHubReleaseResolveResult> {
  return withCache('esos-github-latest-stable', CACHE_TTL, async () => {
    const fromRelease = await fetchLatestFromReleasesApi()
    if (fromRelease.ok && fromRelease.latest) return fromRelease
    const fromTags = await fetchLatestFromTagsApi()
    if (fromTags.ok && fromTags.latest) return fromTags
    return fromTags.ok ? fromTags : (fromRelease.error ? fromRelease : fromTags)
  })
}

export async function fetchESOSTags(): Promise<GitHubTag[]> {
  return withCache('esos-github-tags', CACHE_TTL, async () => {
    const res = await fetchWithTimeout(`${GITHUB_API}/tags?per_page=100`)
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

    const tags: GitHubTag[] = []
    for (let i = 0; i < raw.length; i += 5) {
      const batch    = raw.slice(i, i + 5)
      const enriched = await Promise.all(batch.map(enrichTag))
      tags.push(...enriched)
    }

    return sortSemverTagsDesc(filterSemverTags(tags))
  })
}

async function enrichTag(raw: {
  name: string
  commit: { sha: string; url: string }
  zipball_url: string
  tarball_url: string
}): Promise<GitHubTag> {
  const name = cleanTagName(raw.name)
  let publishedAt: string | null = null

  try {
    const commitRes = await fetchWithTimeout(raw.commit.url)
    if (commitRes.ok) {
      const data = await commitRes.json()
      publishedAt = data?.commit?.author?.date ?? null
    }
  } catch { /* best effort */ }

  return {
    name,
    sha:         raw.commit.sha.slice(0, 7),
    publishedAt,
    zipUrl:      raw.zipball_url,
    tarUrl:      raw.tarball_url,
    downloadUrl: buildDownloadUrl(name),
  }
}

function buildDownloadUrl(tag: string): string {
  const major  = parseInt(tag.split('.')[0], 10)
  const branch = `${major}.x.x`
  return `https://download.esos-project.com/${branch}/esos-${tag}.zip`
}
