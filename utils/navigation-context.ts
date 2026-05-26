import type { RouteLocationNormalized } from 'vue-router'
import { ALL_SANS_ID } from '~/composables/useSelectedSan'
import type { ClusterSelectionDto, SanSelectionDto } from '~/server/utils/selection-context'

export type NavigationContextKind =
  | 'all'
  | 'standaloneSan'
  | 'clusteredSan'
  | 'cluster'
  | 'none'

export type NavSwitchTarget =
  | { path: string; query?: Record<string, string> }
  | null

const ADMIN_SAN_SCOPED_RE =
  /^\/admin\/sans\/([^/]+)\/(system-config|raid|performance|advanced-storage)$/

const OPERATIONAL_STATIC_PREFIXES = [
  '/',
  '/targets',
  '/devices',
  '/sessions',
  '/stats',
  '/history',
  '/hardware',
  '/topology',
  '/inventory',
]

const ADMIN_STATIC_PREFIXES = [
  '/admin/users',
  '/admin/esos-version',
  '/admin/dependencies',
  '/admin/app-version',
  '/admin/auth-providers',
  '/admin/alert-thresholds',
  '/admin/performance',
  '/admin/change-password',
]

export interface NavigationContextInput {
  selectedId: string | null
  selected: SanSelectionDto | null
  selectedCluster: ClusterSelectionDto | null
  isAll: boolean
  clusters: ClusterSelectionDto[]
  activeSans: SanSelectionDto[]
}

export function getNavigationContextKind(input: NavigationContextInput): NavigationContextKind {
  if (!input.activeSans.length) return 'none'
  if (input.isAll) return 'all'
  if (input.selectedCluster) return 'cluster'
  if (input.selected) {
    return input.selected.clusterId ? 'clusteredSan' : 'standaloneSan'
  }
  return 'none'
}

export function computeShowClusterHaNav(input: NavigationContextInput): boolean {
  if (!input.clusters.length) return false

  const kind = getNavigationContextKind(input)
  if (kind === 'cluster' || kind === 'clusteredSan') return true
  if (kind === 'all') return true
  return false
}

export function computeShowTopContextSelector(input: NavigationContextInput): boolean {
  return input.activeSans.length >= 1
}

export function computeShowMultiSelector(input: NavigationContextInput): boolean {
  return input.activeSans.length > 1 || input.clusters.length > 0
}

function isOperationalStatic(path: string): boolean {
  if (path === '/') return true
  if (path.startsWith('/targets/')) return true
  return OPERATIONAL_STATIC_PREFIXES.some(p => p !== '/' && path.startsWith(p))
}

function isAdminStatic(path: string): boolean {
  if (path === '/admin') return true
  return ADMIN_STATIC_PREFIXES.some(p => path.startsWith(p))
}

function clusterIdForSan(
  sanId: string,
  sans: SanSelectionDto[],
): string | null {
  return sans.find(s => s.id === sanId)?.clusterId ?? null
}

function sanitizeQueryForSanSwitch(
  query: Record<string, string | string[] | undefined>,
  nextSanId: string,
  sans: SanSelectionDto[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(query)) {
    if (val === undefined || val === null) continue
    const s = Array.isArray(val) ? val[0] : val
    if (s !== undefined && s !== '') out[key] = s
  }

  if (out.scope === 'cluster' && out.clusterId) {
    const cid = clusterIdForSan(nextSanId, sans)
    if (!cid || cid !== out.clusterId) {
      delete out.scope
      delete out.clusterId
    }
  }

  return out
}

export function resolveContextSwitchTarget(
  nextId: string,
  route: Pick<RouteLocationNormalized, 'path' | 'query'>,
  input: NavigationContextInput,
): NavSwitchTarget {
  const path = route.path
  const query = route.query as Record<string, string | string[] | undefined>

  if (nextId === ALL_SANS_ID) {
    if (ADMIN_SAN_SCOPED_RE.test(path)) {
      return { path: '/admin/sans' }
    }
    return null
  }

  const cluster = input.clusters.find(c => c.id === nextId)
  if (cluster) {
    if (path.startsWith('/admin')) {
      if (ADMIN_SAN_SCOPED_RE.test(path)) {
        return { path: '/admin/cluster', query: { clusterId: cluster.id } }
      }
      if (path === '/admin/sans') {
        return { path: '/admin/cluster', query: { clusterId: cluster.id } }
      }
      if (path.startsWith('/admin/cluster')) {
        return { path: '/admin/cluster', query: { clusterId: cluster.id } }
      }
      return { path: '/admin/cluster', query: { clusterId: cluster.id } }
    }

    if (path === '/cluster' || path.startsWith('/admin/cluster')) {
      return { path: '/cluster', query: { clusterId: cluster.id } }
    }
    if (!isOperationalStatic(path)) {
      return { path: '/cluster', query: { clusterId: cluster.id } }
    }
    return null
  }

  const san = input.activeSans.find(s => s.id === nextId)
  if (!san) return null

  const adminMatch = path.match(ADMIN_SAN_SCOPED_RE)
  if (adminMatch) {
    const suffix = adminMatch[2]
    const nextQuery = sanitizeQueryForSanSwitch(query, san.id, input.activeSans)
    return {
      path: `/admin/sans/${san.id}/${suffix}`,
      query: Object.keys(nextQuery).length ? nextQuery : undefined,
    }
  }

  if (path === '/cluster') {
    if (san.clusterId) {
      return { path: '/cluster', query: { clusterId: san.clusterId } }
    }
    return { path: '/' }
  }

  if (path.startsWith('/admin/cluster')) {
    if (san.clusterId) {
      return { path: '/admin/cluster', query: { clusterId: san.clusterId } }
    }
    return { path: '/admin/sans' }
  }

  if (path === '/admin/sans') {
    return null
  }

  if (isAdminStatic(path) || isOperationalStatic(path)) {
    return null
  }

  return null
}

export function resolveInvalidClusterRouteRedirect(
  route: Pick<RouteLocationNormalized, 'path' | 'query'>,
  input: NavigationContextInput,
): NavSwitchTarget {
  const kind = getNavigationContextKind(input)
  const path = route.path

  if (path === '/cluster' || path.startsWith('/admin/cluster')) {
    if (kind === 'standaloneSan' || kind === 'none') {
      if (path.startsWith('/admin')) {
        const eff = input.selected ?? input.activeSans[0]
        if (eff) {
          return { path: `/admin/sans/${eff.id}/system-config` }
        }
        return { path: '/admin/sans' }
      }
      return { path: '/' }
    }
  }

  const adminMatch = path.match(ADMIN_SAN_SCOPED_RE)
  if (adminMatch && route.query?.scope === 'cluster') {
    const sanId = adminMatch[1]
    const san = input.activeSans.find(s => s.id === sanId)
    const clusterId = typeof route.query.clusterId === 'string' ? route.query.clusterId : undefined
    if (san && clusterId && san.clusterId !== clusterId) {
      const q = { ...sanitizeQueryForSanSwitch(route.query as Record<string, string | string[] | undefined>, san.id, input.activeSans) }
      return {
        path: `/admin/sans/${san.id}/${adminMatch[2]}`,
        query: Object.keys(q).length ? q : undefined,
      }
    }
    if (san && !san.clusterId && route.query.scope === 'cluster') {
      const q = sanitizeQueryForSanSwitch(route.query as Record<string, string | string[] | undefined>, san.id, input.activeSans)
      return {
        path: `/admin/sans/${san.id}/${adminMatch[2]}`,
        query: Object.keys(q).length ? q : undefined,
      }
    }
  }

  return null
}

export function syncSelectedIdFromRoute(
  route: Pick<RouteLocationNormalized, 'path' | 'query'>,
  input: NavigationContextInput,
): string | null {
  const adminMatch = route.path.match(ADMIN_SAN_SCOPED_RE)
  if (adminMatch) {
    const sanId = adminMatch[1]
    if (input.activeSans.some(s => s.id === sanId)) {
      return sanId
    }
  }

  if (route.path.startsWith('/admin/cluster') || route.path === '/cluster') {
    const cid = route.query?.clusterId
    if (typeof cid === 'string' && input.clusters.some(c => c.id === cid)) {
      return cid
    }
  }

  return null
}
