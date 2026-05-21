import { describe, expect, it } from 'vitest'
import { mapClusterStorageAttentionToRaidItems } from '../utils/raid-cluster-attention-mapper'
import type { ClusterAttentionPoint } from '../types/cluster-admin'

const t = (key: string) => key

describe('mapClusterStorageAttentionToRaidItems', () => {
  it('skips md_warn when summary is UUID-only in local_symmetric mode', () => {
    const points: ClusterAttentionPoint[] = [{
      id: 'md_warn:md0',
      severity: 'warning',
      category: 'storage_md',
      title: 'MD md0 — état dégradé',
      summary: 'UUID MD différents entre nœuds actifs pour md0 : aaa, bbb — ce ne sont pas le même tableau',
      affectedNodeIds: ['n1', 'n2'],
      affectedNodeLabels: ['esos1', 'esos2'],
      recommendedAction: 'open_raid',
      dismissible: false,
      source: 'md_detection',
      detectedAt: Date.now(),
    }]
    expect(mapClusterStorageAttentionToRaidItems(points, 'n1', t)).toHaveLength(0)
  })

  it('skips md_asym when only symmetric LVM usage in local_symmetric mode', () => {
    const points: ClusterAttentionPoint[] = [{
      id: 'md_asym:md0',
      severity: 'blocking',
      category: 'storage_md',
      title: 'MD md0 — asymétrie cluster',
      summary: 'esos1 : /dev/md0 est utilisé par LVM',
      affectedNodeIds: ['n1', 'n2'],
      affectedNodeLabels: ['esos1', 'esos2'],
      recommendedAction: 'run_recovery',
      dismissible: false,
      source: 'md_detection',
      detectedAt: Date.now(),
    }]
    const items = mapClusterStorageAttentionToRaidItems(points, 'n1', t)
    expect(items).toHaveLength(0)
  })
})
