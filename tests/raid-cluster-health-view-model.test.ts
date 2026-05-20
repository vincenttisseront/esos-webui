import { describe, expect, it } from 'vitest'
import {
  buildRaidClusterHealthViewModel,
  groupRaidActionableItems,
  prioritySortActionable,
} from '../utils/raid-cluster-health-view-model'
import type { ClusterAttentionPoint } from '../types/cluster-admin'
import type { RaidOverviewResponse } from '../types/raid'

const t = (key: string, params?: Record<string, string | number>) => {
  let s = key
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v))
  }
  return s
}

function baseOverview(overrides: Partial<RaidOverviewResponse> = {}): RaidOverviewResponse {
  return {
    scannedAt: Date.now(),
    tools: { mdadm: true, lspci: false, storcli: false, perccli: false, MegaCli64: false, arcconf: false, lsscsi: false, wipefs: false, parted: false, sfdisk: false, fdisk: false, partprobe: false, udevadm: false },
    hardwareControllers: [],
    mdArrays: [],
    stoppedMdArrays: [],
    blockDevices: [],
    alerts: [],
    mdDetection: { nodeSanId: 'san-a', nodeLabel: 'node-a', hasAnyMdState: false, items: [] },
    ...overrides,
  }
}

describe('buildRaidClusterHealthViewModel', () => {
  it('returns healthy with empty actionable when active clean array only', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdArrays: [{
          name: 'md0',
          path: '/dev/md0',
          raidLevel: '1',
          state: 'clean',
          raidDevices: 2,
          activeDevices: 2,
          workingDevices: 2,
          failedDevices: 0,
          spareDevices: 0,
          members: [],
          usedBy: [],
          warnings: [],
        }],
        mdDetection: {
          nodeSanId: 'san-a',
          nodeLabel: 'node-a',
          hasAnyMdState: true,
          items: [{
            kind: 'active_kernel',
            path: '/dev/md0',
            nodeSanId: 'san-a',
            nodeLabel: 'node-a',
            severity: 'info',
            summary: 'active',
            reasons: [],
            recommendedAction: 'none',
            uiAnchor: 'software-active',
          }],
        },
      }),
      currentSanId: 'san-a',
      isClustered: false,
      t,
    })
    expect(vm.health).toBe('healthy')
    expect(vm.localHealth).toBe('healthy')
    expect(vm.clusterHealth).toBe('healthy')
    expect(vm.actionableItems).toHaveLength(0)
    expect(vm.summary.activeArraysCount).toBe(1)
    expect(vm.summary.activeArrayMainStatus).toBe('clean')
  })

  it('stays healthy when clean md0 has members and detection has no orphan metadata', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdArrays: [{
          name: 'md0',
          path: '/dev/md0',
          raidLevel: '1',
          state: 'clean',
          raidDevices: 2,
          activeDevices: 2,
          workingDevices: 2,
          failedDevices: 0,
          spareDevices: 0,
          members: [
            { path: '/dev/sdb1', slot: 0, state: ['active', 'sync'] },
            { path: '/dev/sdc1', slot: 1, state: ['active', 'sync'] },
          ],
          usedBy: [],
          warnings: [],
        }],
        mdDetection: {
          nodeSanId: 'san-a',
          nodeLabel: 'node-a',
          hasAnyMdState: true,
          items: [{
            kind: 'active_kernel',
            path: '/dev/md0',
            nodeSanId: 'san-a',
            nodeLabel: 'node-a',
            severity: 'info',
            summary: 'active',
            reasons: [],
            recommendedAction: 'none',
            uiAnchor: 'software-active',
          }],
        },
      }),
      currentSanId: 'san-a',
      isClustered: false,
      t,
    })
    expect(vm.health).toBe('healthy')
    expect(vm.actionableItems).toHaveLength(0)
  })

  it('suppresses local metadata actionable for active member paths (defensive)', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdArrays: [{
          name: 'md0',
          path: '/dev/md0',
          raidLevel: '1',
          state: 'clean',
          raidDevices: 2,
          activeDevices: 2,
          workingDevices: 2,
          failedDevices: 0,
          spareDevices: 0,
          members: [{ path: '/dev/sdb1', slot: 0, state: ['active', 'sync'] }],
          usedBy: [],
          warnings: [],
        }],
        mdDetection: {
          nodeSanId: 'san-a',
          nodeLabel: 'node-a',
          hasAnyMdState: true,
          items: [
            {
              kind: 'active_kernel',
              path: '/dev/md0',
              nodeSanId: 'san-a',
              nodeLabel: 'node-a',
              severity: 'info',
              summary: 'active',
              reasons: [],
              recommendedAction: 'none',
              uiAnchor: 'software-active',
            },
            {
              kind: 'partition_metadata',
              path: '/dev/sdb1',
              nodeSanId: 'san-a',
              nodeLabel: 'node-a',
              severity: 'blocking',
              summary: 'Métadonnées MD sur partition /dev/sdb1',
              reasons: ['Superblock'],
              recommendedAction: 'zero_superblock',
              uiAnchor: 'devices',
            },
          ],
        },
      }),
      currentSanId: 'san-a',
      isClustered: false,
      t,
    })
    expect(vm.health).toBe('healthy')
    expect(vm.actionableItems.some(i => i.category === 'metadata_local')).toBe(false)
  })

  it('does not create metadata_peer when peer detection has only active_kernel', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdArrays: [{
          name: 'md0',
          path: '/dev/md0',
          raidLevel: '1',
          state: 'clean',
          raidDevices: 2,
          activeDevices: 2,
          workingDevices: 2,
          failedDevices: 0,
          spareDevices: 0,
          members: [
            { path: '/dev/sdb1', slot: 0, state: ['active', 'sync'] },
            { path: '/dev/sdc1', slot: 1, state: ['active', 'sync'] },
          ],
          usedBy: [],
          warnings: [],
        }],
        mdDetection: {
          nodeSanId: 'san-a',
          nodeLabel: 'node-a',
          hasAnyMdState: true,
          items: [{
            kind: 'active_kernel',
            path: '/dev/md0',
            nodeSanId: 'san-a',
            nodeLabel: 'node-a',
            severity: 'info',
            summary: 'active',
            reasons: [],
            recommendedAction: 'none',
            uiAnchor: 'software-active',
          }],
        },
        clusterMdDetection: [{
          nodeSanId: 'san-b',
          nodeLabel: 'node-b',
          hasAnyMdState: true,
          items: [{
            kind: 'active_kernel',
            path: '/dev/md0',
            nodeSanId: 'san-b',
            nodeLabel: 'node-b',
            severity: 'info',
            summary: 'active',
            reasons: [],
            recommendedAction: 'none',
            uiAnchor: 'software-active',
          }],
        }],
      }),
      currentSanId: 'san-a',
      isClustered: true,
      t,
    })
    expect(vm.actionableItems.some(i => i.category === 'metadata_peer')).toBe(false)
    expect(vm.health).toBe('healthy')
  })

  it('local healthy + peer same UUID => global healthy', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdArrays: [{
          name: 'md0',
          path: '/dev/md0',
          uuid: 'aaa-111',
          raidLevel: '1',
          state: 'clean',
          raidDevices: 2,
          activeDevices: 2,
          workingDevices: 2,
          failedDevices: 0,
          spareDevices: 0,
          members: [],
          usedBy: [],
          warnings: [],
        }],
        mdDetection: { nodeSanId: 'san-a', nodeLabel: 'node-a', hasAnyMdState: true, items: [] },
        clusterMdDetection: [{
          nodeSanId: 'san-b',
          nodeLabel: 'node-b',
          hasAnyMdState: true,
          items: [],
          activeMdArrays: [{ name: 'md0', path: '/dev/md0', uuid: 'aaa-111', state: 'clean' }],
        }],
      }),
      currentSanId: 'san-a',
      isClustered: true,
      t,
    })
    expect(vm.localHealth).toBe('healthy')
    expect(vm.clusterHealth).toBe('healthy')
    expect(vm.health).toBe('healthy')
    expect(vm.actionableItems.some(i => i.category === 'cluster_uuid_mismatch')).toBe(false)
    expect(vm.headline).toBe('raid.cockpit.headline.no_attention')
    expect(vm.summary.peerConsistencyStatus).toBe('ok')
  })

  it('local healthy + peer UUID mismatch => global warning', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdArrays: [{
          name: 'md0',
          path: '/dev/md0',
          uuid: 'aaa-111',
          raidLevel: '1',
          state: 'clean',
          raidDevices: 2,
          activeDevices: 2,
          workingDevices: 2,
          failedDevices: 0,
          spareDevices: 0,
          members: [],
          usedBy: [],
          warnings: [],
        }],
        mdDetection: { nodeSanId: 'san-a', nodeLabel: 'node-a', hasAnyMdState: true, items: [] },
        clusterMdDetection: [{
          nodeSanId: 'san-b',
          nodeLabel: 'node-b',
          hasAnyMdState: true,
          items: [],
          activeMdArrays: [{ name: 'md0', path: '/dev/md0', uuid: 'bbb-222', state: 'clean' }],
        }],
      }),
      currentSanId: 'san-a',
      isClustered: true,
      t,
    })
    expect(vm.localHealth).toBe('healthy')
    expect(vm.clusterHealth).toBe('warning')
    expect(vm.health).toBe('warning')
    expect(vm.actionableItems.some(i => i.category === 'cluster_uuid_mismatch')).toBe(true)
    expect(vm.headline).toBe('raid.cockpit.headline.cluster_attention')
    expect(vm.headline).not.toBe('raid.cockpit.headline.no_attention')
    expect(vm.summary.peerConsistencyStatus).toBe('critical')
    expect(vm.storageFactsHint).toBe('raid.cockpit.facts_line_storage_hint')
  })

  it('local healthy + peer metadata residual => global warning', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdDetection: { nodeSanId: 'san-a', nodeLabel: 'node-a', hasAnyMdState: false, items: [] },
        clusterMdDetection: [{
          nodeSanId: 'san-b',
          nodeLabel: 'node-b',
          hasAnyMdState: true,
          items: [{
            kind: 'partition_metadata',
            path: '/dev/sdc9',
            nodeSanId: 'san-b',
            nodeLabel: 'node-b',
            severity: 'blocking',
            summary: 'peer orphan',
            reasons: [],
            recommendedAction: 'zero_superblock',
            uiAnchor: 'devices',
          }],
        }],
      }),
      currentSanId: 'san-a',
      isClustered: true,
      t,
    })
    expect(vm.localHealth).toBe('healthy')
    expect(vm.clusterHealth).toBe('warning')
    expect(vm.health).toBe('warning')
    expect(vm.actionableItems.some(i => i.category === 'metadata_peer')).toBe(true)
  })

  it('creates metadata_peer for peer orphan partition not in active members', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        clusterMdDetection: [{
          nodeSanId: 'san-b',
          nodeLabel: 'node-b',
          hasAnyMdState: true,
          items: [{
            kind: 'partition_metadata',
            path: '/dev/sdc9',
            nodeSanId: 'san-b',
            nodeLabel: 'node-b',
            severity: 'blocking',
            summary: 'peer orphan',
            reasons: [],
            recommendedAction: 'zero_superblock',
            uiAnchor: 'devices',
          }],
        }],
      }),
      currentSanId: 'san-a',
      isClustered: true,
      t,
    })
    expect(vm.actionableItems.some(i => i.category === 'metadata_peer')).toBe(true)
  })

  it('creates local metadata actionable item', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdDetection: {
          nodeSanId: 'san-a',
          nodeLabel: 'node-a',
          hasAnyMdState: true,
          items: [{
            kind: 'partition_metadata',
            path: '/dev/sdb1',
            nodeSanId: 'san-a',
            nodeLabel: 'node-a',
            severity: 'blocking',
            summary: 'Métadonnées MD sur partition /dev/sdb1',
            reasons: ['Superblock'],
            recommendedAction: 'zero_superblock',
            uiAnchor: 'devices',
          }],
        },
      }),
      currentSanId: 'san-a',
      isClustered: false,
      t,
    })
    expect(vm.health).toBe('warning')
    expect(vm.actionableItems.some(i => i.category === 'metadata_local')).toBe(true)
    expect(vm.actionableItems[0]?.primaryActionTarget?.type).toBe('devices')
  })

  it('aggregates peer metadata per node', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        clusterMdDetection: [{
          nodeSanId: 'san-b',
          nodeLabel: 'node-b',
          hasAnyMdState: true,
          items: [{
            kind: 'partition_metadata',
            path: '/dev/sdc1',
            nodeSanId: 'san-b',
            nodeLabel: 'node-b',
            severity: 'blocking',
            summary: 'peer meta',
            reasons: [],
            recommendedAction: 'zero_superblock',
            uiAnchor: 'devices',
          }],
        }],
      }),
      currentSanId: 'san-a',
      isClustered: true,
      t,
    })
    expect(vm.actionableItems.some(i => i.category === 'metadata_peer')).toBe(true)
    expect(vm.actionableItems.find(i => i.category === 'metadata_peer')?.primaryActionTarget?.sanId).toBe('san-b')
  })

  it('merges cluster attention storage_md when overview lacks peer UUID data', () => {
    const attention: ClusterAttentionPoint[] = [{
      id: 'md_warn:md0',
      severity: 'warning',
      category: 'storage_md',
      title: 'MD md0 — état dégradé',
      summary: 'UUID MD différents entre nœuds actifs pour md0 : aaa, bbb — ce ne sont pas le même tableau',
      affectedNodeIds: ['san-a', 'san-b'],
      affectedNodeLabels: ['esos1', 'esos2'],
      recommendedAction: 'open_raid',
      dismissible: false,
      source: 'md_detection',
      detectedAt: Date.now(),
    }]
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdArrays: [{
          name: 'md0',
          path: '/dev/md0',
          uuid: 'aaa',
          raidLevel: '1',
          state: 'clean',
          raidDevices: 2,
          activeDevices: 2,
          workingDevices: 2,
          failedDevices: 0,
          spareDevices: 0,
          members: [],
          usedBy: [],
          warnings: [],
        }],
        mdDetection: { nodeSanId: 'san-a', nodeLabel: 'esos1', hasAnyMdState: true, items: [] },
        clusterMdDetection: [{
          nodeSanId: 'san-b',
          nodeLabel: 'esos2',
          hasAnyMdState: true,
          items: [{
            kind: 'active_kernel',
            path: '/dev/md0',
            nodeSanId: 'san-b',
            nodeLabel: 'esos2',
            severity: 'info',
            summary: 'active',
            reasons: [],
            recommendedAction: 'none',
            uiAnchor: 'software-active',
          }],
          activeMdArrays: [{ name: 'md0', path: '/dev/md0', state: 'clean' }],
        }],
      }),
      currentSanId: 'san-a',
      isClustered: true,
      clusterStorageAttention: attention,
      t,
    })
    expect(vm.health).toBe('warning')
    expect(vm.localHealth).toBe('healthy')
    expect(vm.actionableItems.some(i => i.category === 'cluster_uuid_mismatch')).toBe(true)
    expect(vm.headline).not.toBe('raid.cockpit.headline.no_attention')
  })

  it('detects cluster asymmetry when peer lacks active array', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview({
        mdArrays: [{
          name: 'md0',
          path: '/dev/md0',
          raidLevel: '1',
          state: 'clean',
          raidDevices: 2,
          activeDevices: 2,
          workingDevices: 2,
          failedDevices: 0,
          spareDevices: 0,
          members: [],
          usedBy: [],
          warnings: [],
        }],
        clusterMdDetection: [{
          nodeSanId: 'san-b',
          nodeLabel: 'node-b',
          hasAnyMdState: false,
          items: [],
        }],
      }),
      currentSanId: 'san-a',
      isClustered: true,
      t,
    })
    expect(vm.actionableItems.some(i => i.category === 'cluster_asymmetry')).toBe(true)
    expect(vm.health).toBe('critical')
  })
})

describe('groupRaidActionableItems', () => {
  it('merges metadata_local items with same title into one group', () => {
    const items = [
      {
        id: 'metadata_local:/dev/sdb1',
        severity: 'warning' as const,
        category: 'metadata_local' as const,
        title: 'Métadonnées MD orphelines sur ce nœud',
        impact: 'Peut empêcher la réutilisation de la partition.',
        recommendation: 'Effacer les superblocks.',
        details: ['/dev/sdb1'],
        primaryActionLabel: 'Voir périphériques',
        primaryActionTarget: { type: 'devices' as const, path: '/dev/sdb1' },
      },
      {
        id: 'metadata_local:/dev/sdc1',
        severity: 'warning' as const,
        category: 'metadata_local' as const,
        title: 'Métadonnées MD orphelines sur ce nœud',
        impact: 'Peut empêcher la réutilisation de la partition.',
        recommendation: 'Effacer les superblocks.',
        details: ['/dev/sdc1'],
        primaryActionLabel: 'Voir périphériques',
        primaryActionTarget: { type: 'devices' as const, path: '/dev/sdc1' },
      },
    ]
    const grouped = groupRaidActionableItems(items, t)
    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.affectedPaths.sort()).toEqual(['/dev/sdb1', '/dev/sdc1'])
    expect(grouped[0]?.impact).toBe('raid.cockpit.item.metadata_local.impact_plural')
  })
})

describe('prioritySortActionable', () => {
  it('sorts critical before warning', () => {
    const sorted = prioritySortActionable([
      { id: 'w', severity: 'warning', category: 'metadata_local', title: '', impact: '', recommendation: '', details: [] },
      { id: 'c', severity: 'critical', category: 'cluster_asymmetry', title: '', impact: '', recommendation: '', details: [] },
    ])
    expect(sorted[0]?.severity).toBe('critical')
  })
})
