import { describe, it, expect } from 'vitest'
import {
  buildPerSanRaidPageHealth,
  resolveClusterCockpitHealthFromAttention,
} from '../utils/cluster-raid-page-health'
import type { ClusterAttentionResponse } from '../types/cluster-admin'

function attention(partial: Partial<ClusterAttentionResponse>): ClusterAttentionResponse {
  return {
    clusterId: 'c1',
    clusterName: 'HA',
    health: 'healthy',
    attentionPoints: [],
    attentionCount: 0,
    scannedAt: Date.now(),
    ...partial,
  }
}

describe('buildPerSanRaidPageHealth', () => {
  it('local OK + cluster critical => page critical', () => {
    const r = buildPerSanRaidPageHealth({
      localRaidHealth: 'ok',
      cockpit: {
        localHealth: 'healthy',
        clusterHealth: 'healthy',
        health: 'healthy',
      },
      clusterAttention: attention({
        health: 'critical',
        storageOverall: 'critical',
        storageSummary: 'MD md0 asymmetry',
      }),
      isClustered: true,
    })
    expect(r.localHealth).toBe('ok')
    expect(r.clusterHealth).toBe('critical')
    expect(r.pageHealth).toBe('critical')
    expect(r.isClusterCritical).toBe(true)
  })

  it('local OK + cluster OK => page OK', () => {
    const r = buildPerSanRaidPageHealth({
      localRaidHealth: 'ok',
      cockpit: {
        localHealth: 'healthy',
        clusterHealth: 'healthy',
        health: 'healthy',
      },
      clusterAttention: attention({ health: 'healthy', storageOverall: 'ok' }),
      isClustered: true,
    })
    expect(r.pageHealth).toBe('ok')
    expect(r.clusterHealth).toBe('ok')
  })

  it('local warning + cluster OK => page warning', () => {
    const r = buildPerSanRaidPageHealth({
      localRaidHealth: 'warning',
      cockpit: {
        localHealth: 'warning',
        clusterHealth: 'healthy',
        health: 'warning',
      },
      clusterAttention: attention({ health: 'healthy', storageOverall: 'ok' }),
      isClustered: true,
    })
    expect(r.pageHealth).toBe('warning')
    expect(r.localHealth).toBe('warning')
    expect(r.clusterHealth).toBe('ok')
  })
})

describe('resolveClusterCockpitHealthFromAttention', () => {
  it('elevates to critical from storageOverall when items are healthy', () => {
    const h = resolveClusterCockpitHealthFromAttention(
      attention({ health: 'healthy', storageOverall: 'critical' }),
      'healthy',
    )
    expect(h).toBe('critical')
  })
})
