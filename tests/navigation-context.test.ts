import { describe, it, expect } from 'vitest'
import {
  computeShowClusterHaNav,
  computeShowTopContextSelector,
  getNavigationContextKind,
  resolveContextSwitchTarget,
  resolveInvalidClusterRouteRedirect,
} from '../utils/navigation-context'
import { ALL_SANS_ID } from '../composables/useSelectedSan'
import type { NavigationContextInput } from '../utils/navigation-context'
import type { SanSelectionDto, ClusterSelectionDto } from '../server/utils/selection-context'

function san(
  id: string,
  clusterId: string | null = null,
): SanSelectionDto {
  return {
    id,
    label: id,
    status: 'active',
    readOnly: false,
    clusterId,
    clusterEnabled: !!clusterId,
    clusterRole: clusterId ? 'primary' : null,
    clusterPeer: null,
  }
}

function cluster(id: string, nodeIds: string[]): ClusterSelectionDto {
  return {
    id,
    name: id,
    nodes: nodeIds.map(nid => ({
      id: nid,
      label: nid,
      status: 'active',
      clusterRole: 'primary',
    })),
  }
}

function baseInput(overrides: Partial<NavigationContextInput> = {}): NavigationContextInput {
  return {
    selectedId: 'san-a',
    selected: san('san-a', null),
    selectedCluster: null,
    isAll: false,
    clusters: [],
    activeSans: [san('san-a', null)],
    ...overrides,
  }
}

describe('navigation context visibility', () => {
  it('standalone SAN hides cluster HA nav', () => {
    const input = baseInput()
    expect(computeShowClusterHaNav(input)).toBe(false)
    expect(getNavigationContextKind(input)).toBe('standaloneSan')
  })

  it('clustered SAN shows cluster HA nav when clusters exist', () => {
    const input = baseInput({
      selected: san('san-a', 'cl-1'),
      activeSans: [san('san-a', 'cl-1')],
      clusters: [cluster('cl-1', ['san-a'])],
    })
    expect(computeShowClusterHaNav(input)).toBe(true)
    expect(getNavigationContextKind(input)).toBe('clusteredSan')
  })

  it('cluster selection shows cluster HA nav', () => {
    const input = baseInput({
      selectedId: 'cl-1',
      selected: null,
      selectedCluster: cluster('cl-1', ['san-a', 'san-b']),
      clusters: [cluster('cl-1', ['san-a', 'san-b'])],
      activeSans: [san('san-a', 'cl-1'), san('san-b', 'cl-1')],
    })
    expect(computeShowClusterHaNav(input)).toBe(true)
    expect(getNavigationContextKind(input)).toBe('cluster')
  })

  it('all with clusters shows cluster HA nav', () => {
    const input = baseInput({
      selectedId: ALL_SANS_ID,
      selected: null,
      isAll: true,
      clusters: [cluster('cl-1', ['san-a'])],
      activeSans: [san('san-a', 'cl-1')],
    })
    expect(computeShowClusterHaNav(input)).toBe(true)
  })

  it('all without clusters hides cluster HA nav', () => {
    const input = baseInput({
      selectedId: ALL_SANS_ID,
      isAll: true,
      selected: null,
    })
    expect(computeShowClusterHaNav(input)).toBe(false)
  })

  it('show top selector when at least one active SAN', () => {
    expect(computeShowTopContextSelector(baseInput())).toBe(true)
    expect(computeShowTopContextSelector(baseInput({ activeSans: [] }))).toBe(false)
  })
})

describe('resolveContextSwitchTarget', () => {
  it('rewrites admin per-SAN route when switching SAN', () => {
    const input = baseInput({
      activeSans: [san('san-a', null), san('san-b', null)],
    })
    const target = resolveContextSwitchTarget('san-b', {
      path: '/admin/sans/san-a/raid',
      query: {},
    }, input)
    expect(target).toEqual({ path: '/admin/sans/san-b/raid' })
  })

  it('preserves query on system-config switch', () => {
    const input = baseInput({
      activeSans: [san('san-a', 'cl-1'), san('san-b', 'cl-1')],
      clusters: [cluster('cl-1', ['san-a', 'san-b'])],
    })
    const target = resolveContextSwitchTarget('san-b', {
      path: '/admin/sans/san-a/system-config',
      query: { tab: 'upgrade', scope: 'cluster', clusterId: 'cl-1' },
    }, input)
    expect(target?.path).toBe('/admin/sans/san-b/system-config')
    expect(target?.query?.tab).toBe('upgrade')
    expect(target?.query?.scope).toBe('cluster')
    expect(target?.query?.clusterId).toBe('cl-1')
  })

  it('redirects operational cluster to home for standalone SAN', () => {
    const input = baseInput()
    const target = resolveContextSwitchTarget('san-a', {
      path: '/cluster',
      query: { clusterId: 'cl-1' },
    }, input)
    expect(target).toEqual({ path: '/' })
  })

  it('navigates to admin cluster when selecting cluster from per-SAN admin route', () => {
    const input = baseInput({
      clusters: [cluster('cl-1', ['san-a'])],
      activeSans: [san('san-a', 'cl-1')],
    })
    const target = resolveContextSwitchTarget('cl-1', {
      path: '/admin/sans/san-a/raid',
      query: {},
    }, input)
    expect(target).toEqual({ path: '/admin/cluster', query: { clusterId: 'cl-1' } })
  })
})

describe('resolveInvalidClusterRouteRedirect', () => {
  it('redirects standalone off operational cluster page', () => {
    const input = baseInput()
    const target = resolveInvalidClusterRouteRedirect({
      path: '/cluster',
      query: {},
    }, input)
    expect(target).toEqual({ path: '/' })
  })

  it('redirects standalone off admin cluster page', () => {
    const input = baseInput()
    const target = resolveInvalidClusterRouteRedirect({
      path: '/admin/cluster',
      query: {},
    }, input)
    expect(target?.path).toBe('/admin/sans/san-a/system-config')
  })
})
