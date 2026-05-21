import { parseSemver, compareSemverOrder } from './semver'
import {
  cachedFetch,
  getCacheEnvelope,
  invalidateServerCacheKey,
  type CacheFetchMeta,
  type CacheSource,
} from './server-cache'
import type { GitHubTag } from './types'

const GITHUB_API = 'https://api.github.com/repos/quantum/esos'
const FETCH_TIMEOUT = 10_000

const CACHE_KEY_LATEST = 'esos-github-latest-stable'
const CACHE_KEY_TAGS = 'esos-github-tags'
const CACHE_KEY_TAGS_LITE = 'esos-github-tags-lite'

function githubCacheTtlMs(): number {
  const raw = process.env.NUXT_GITHUB_CACHE_TTL_MS
  if (raw) {
    const n = Number(raw)
    if (!Number.isNaN(n) && n > 0) return n
  }
  return 6 * 60 * 60 * 1000 // 6h default
}

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
  meta?: CacheFetchMeta
}

export interface GitHubTagsResult {
  tags: GitHubTag[]
  meta: CacheFetchMeta
}

export function invalidateGitHubCaches(): void {
  invalidateServerCacheKey(CACHE_KEY_LATEST)
  invalidateServerCacheKey(CACHE_KEY_TAGS)
  invalidateServerCacheKey(CACHE_KEY_TAGS_LITE)
}

export function getGitHubRefreshThrottleMs(): number {
  return 60_000
}

let lastLiveGithubFetchAt = 0

export function canForceRefreshGitHub(): boolean {
  return Date.now() - lastLiveGithubFetchAt >= getGitHubRefreshThrottleMs()
}

function getBaseHeaders(): Record<string, string> {
  const token = process.env.NUXT_GITHUB_TOKEN ?? ''
  return {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'esos-webui/1.0',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController()
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
    if (process.env.NUXT_DEBUG_CACHE === '1') {
      console.debug('[github] rate_limit 403')
    }
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
    sha: '',
    publishedAt: null,
    zipUrl: '',
    tarUrl: '',
    downloadUrl: buildDownloadUrl(name),
  }
}

function liteTagFromRaw(raw: {
  name: string
  commit: { sha: string }
  zipball_url: string
  tarball_url: string
}): GitHubTag {
  const name = cleanTagName(raw.name)
  return {
    name,
    sha: raw.commit.sha.slice(0, 7),
    publishedAt: null,
    zipUrl: raw.zipball_url,
    tarUrl: raw.tarball_url,
    downloadUrl: buildDownloadUrl(name),
  }
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
    sha: raw.commit.sha.slice(0, 7),
    publishedAt,
    zipUrl: raw.zipball_url,
    tarUrl: raw.tarball_url,
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

async function fetchTagsRaw(): Promise<Array<{
  name: string
  commit: { sha: string; url: string }
  zipball_url: string
  tarball_url: string
}>> {
  const res = await fetchWithTimeout(`${GITHUB_API}/tags?per_page=100`)
  if (!res.ok) {
    throw Object.assign(new Error(`GitHub tags HTTP ${res.status}`), { status: res.status })
  }
  return res.json()
}

async function fetchLatestFromTagsApi(enrich: boolean): Promise<GitHubReleaseResolveResult> {
  try {
    const raw = await fetchTagsRaw()
    const tags: GitHubTag[] = enrich
      ? await enrichTagsBatched(raw)
      : sortSemverTagsDesc(filterSemverTags(raw.map(liteTagFromRaw)))

    const latest = pickLatestSemverTag(tags)
    if (!latest) {
      return { ok: false, latest: null, error: 'no_semver_tags', message: 'No semver tags found' }
    }
    return { ok: true, latest }
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 403) return classifyFetchError(err, { status: 403, ok: false } as Response)
    return classifyFetchError(err)
  }
}

async function enrichTagsBatched(
  raw: Array<{
    name: string
    commit: { sha: string; url: string }
    zipball_url: string
    tarball_url: string
  }>,
): Promise<GitHubTag[]> {
  const tags: GitHubTag[] = []
  for (let i = 0; i < raw.length; i += 5) {
    const batch = raw.slice(i, i + 5)
    const enriched = await Promise.all(batch.map(enrichTag))
    tags.push(...enriched)
  }
  return tags
}

async function loadLatestLive(): Promise<GitHubReleaseResolveResult> {
  lastLiveGithubFetchAt = Date.now()
  const fromRelease = await fetchLatestFromReleasesApi()
  if (fromRelease.ok && fromRelease.latest) return fromRelease
  const fromTags = await fetchLatestFromTagsApi(false)
  if (fromTags.ok && fromTags.latest) return fromTags
  return fromTags.ok ? fromTags : (fromRelease.error ? fromRelease : fromTags)
}

function applyStaleToResolve(
  result: GitHubReleaseResolveResult,
  meta: CacheFetchMeta,
): GitHubReleaseResolveResult {
  if (result.ok) return { ...result, meta }

  const prev = getCacheEnvelope<GitHubReleaseResolveResult>(CACHE_KEY_LATEST)
  const now = Date.now()
  if (prev && now < prev.staleUntil && prev.data.ok && prev.data.latest) {
    return {
      ...prev.data,
      meta: { source: 'stale', fetchedAt: prev.fetchedAt, error: result.message ?? result.error },
    }
  }

  return { ...result, meta }
}

export async function resolveLatestStableRelease(
  options?: { forceRefresh?: boolean },
): Promise<GitHubReleaseResolveResult> {
  const ttl = githubCacheTtlMs()
  const force = options?.forceRefresh === true

  if (force && !canForceRefreshGitHub()) {
    const cached = await resolveLatestStableRelease({ forceRefresh: false })
    return {
      ...cached,
      message: cached.message ?? 'GitHub refresh throttled',
    }
  }

  const { value, meta } = await cachedFetch(
    CACHE_KEY_LATEST,
    loadLatestLive,
    { ttlMs: ttl, forceRefresh: force, staleIfError: false },
  )

  return applyStaleToResolve(value, meta)
}

async function loadTagsLive(enrich: boolean): Promise<GitHubTag[]> {
  lastLiveGithubFetchAt = Date.now()
  const raw = await fetchTagsRaw()
  if (enrich) {
    return sortSemverTagsDesc(filterSemverTags(await enrichTagsBatched(raw)))
  }
  return sortSemverTagsDesc(filterSemverTags(raw.map(liteTagFromRaw)))
}

async function fetchTagsCached(key: string, enrich: boolean, forceRefresh?: boolean): Promise<GitHubTagsResult> {
  const ttl = githubCacheTtlMs()
  try {
    const { value, meta } = await cachedFetch(
      key,
      () => loadTagsLive(enrich),
      { ttlMs: ttl, forceRefresh, staleIfError: false },
    )
    return { tags: value, meta }
  } catch (err) {
    const prev = getCacheEnvelope<GitHubTag[]>(key)
    const now = Date.now()
    if (prev && now < prev.staleUntil && prev.data.length > 0) {
      return {
        tags: prev.data,
        meta: {
          source: 'stale',
          fetchedAt: prev.fetchedAt,
          error: err instanceof Error ? err.message : 'error',
        },
      }
    }
    console.warn(`[esos-github] tags fetch failed: ${err instanceof Error ? err.message : err}`)
    return {
      tags: [],
      meta: { source: 'live', fetchedAt: Date.now(), error: err instanceof Error ? err.message : 'error' },
    }
  }
}

/** Full tag list with commit dates (Version ESOS history). */
export async function fetchESOSTags(options?: { forceRefresh?: boolean }): Promise<GitHubTagsResult> {
  if (options?.forceRefresh && !canForceRefreshGitHub()) {
    return fetchESOSTags()
  }
  return fetchTagsCached(CACHE_KEY_TAGS, true, options?.forceRefresh)
}

/** Semver tags only — no per-commit GitHub calls (upgrade behindCount). */
export async function fetchESOSTagsLite(options?: { forceRefresh?: boolean }): Promise<GitHubTagsResult> {
  return fetchTagsCached(CACHE_KEY_TAGS_LITE, false, options?.forceRefresh)
}

export function githubMetaFromSources(
  sources: CacheSource[],
): CacheSource {
  if (sources.includes('live')) return 'live'
  if (sources.includes('stale')) return 'stale'
  return 'cache'
}

function buildDownloadUrl(tag: string): string {
  const major = parseInt(tag.split('.')[0], 10)
  const branch = `${major}.x.x`
  return `https://download.esos-project.com/${branch}/esos-${tag}.zip`
}
