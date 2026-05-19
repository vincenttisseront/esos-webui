import { describe, expect, it } from 'vitest'
import {
  buildClusterAttentionFromStatus,
  deriveClusterHealth,
} from '../server/utils/cluster-attention'
import type { ClusterOverview } from '../server/utils/types'
import { CLUSTER_SYNC_LIMITATION_LINES } from '../utils/cluster-sync-limitations'

describe('cluster-attention', () => {
  const baseOverview: ClusterOverview = {
    nodes: [
      {
        nodeId: 'a',
        hostname: 'esos1',
        host: '10.0.0.1',
        role: 'primary',
        clusterName: 'ha',
        corosyncEnabled: true,
        corosyncRunning: true,
        pacemakerEnabled: true,
        pacemakerRunning: true,
        pacemakerNodeState: 'Online',
        quorate: true,
        resources: [],
        aluaGroups: [],
        drbd: { resources: [], enabled: false, running: false },
        sshReady: true,
        lastChecked: Date.now(),
      },
    ],
    mode: 'active-passive',
    healthy: true,
    scannedAt: Date.now(),
    clusterId: 'c1',
  }

  it('returns healthy when no attention points', () => {
    const members = [{
      id: 'a',
      label: 'esos1',
      host: '10.0.0.1',
      port: 22,
      status: 'active',
      readOnly: false,
      clusterEnabled: true,
      clusterRole: 'primary',
      clusterId: 'c1',
      clusterPeer: 'b',
    }]
    const points = buildClusterAttentionFromStatus(baseOverview, members)
    expect(points.length).toBe(0)
    expect(deriveClusterHealth(points, true)).toBe('healthy')
  })

  it('flags missing primary', () => {
    const members = [{
      id: 'a',
      label: 'esos1',
      host: '10.0.0.1',
      port: 22,
      status: 'active',
      readOnly: false,
      clusterEnabled: true,
      clusterRole: 'secondary',
      clusterId: 'c1',
      clusterPeer: null,
    }]
    const points = buildClusterAttentionFromStatus(baseOverview, members)
    expect(points.some(p => p.id === 'no_primary')).toBe(true)
    expect(deriveClusterHealth(points, true)).toBe('critical')
  })

  it('sync limitation help lines are not part of attention builder', () => {
    expect(CLUSTER_SYNC_LIMITATION_LINES.length).toBeGreaterThan(0)
    const members = [{
      id: 'a',
      label: 'esos1',
      host: '10.0.0.1',
      port: 22,
      status: 'active',
      readOnly: false,
      clusterEnabled: true,
      clusterRole: 'primary',
      clusterId: 'c1',
      clusterPeer: null,
    }]
    const points = buildClusterAttentionFromStatus(baseOverview, members)
    const text = JSON.stringify(points)
    for (const line of CLUSTER_SYNC_LIMITATION_LINES) {
      expect(text).not.toContain(line)
    }
  })
})
