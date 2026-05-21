import { describe, it, expect } from 'vitest'
import { buildRaidClusterHealthViewModel } from '../utils/raid-cluster-health-view-model'
import type { RaidOverviewResponse } from '../types/raid'

const t = (key: string) => key

function baseOverview(): RaidOverviewResponse {
  return {
    scannedAt: Date.now(),
    tools: { mdadm: true, lspci: false, storcli: false, perccli: false, MegaCli64: false, arcconf: false, lsscsi: false, wipefs: false, parted: false, sfdisk: false, fdisk: false, partprobe: false, udevadm: false },
    hardwareControllers: [],
    mdArrays: [],
    stoppedMdArrays: [],
    blockDevices: [],
    alerts: [],
    mdDetection: { nodeSanId: 'a', nodeLabel: 'esos1', hasAnyMdState: false, items: [] },
  }
}

describe('buildRaidClusterHealthViewModel cluster API health', () => {
  it('uses storageOverall critical when cockpit items are healthy', () => {
    const vm = buildRaidClusterHealthViewModel({
      overview: baseOverview(),
      currentSanId: 'a',
      isClustered: true,
      t,
      clusterAttentionHealth: 'healthy',
      clusterStorageOverall: 'critical',
    })
    expect(vm.localHealth).toBe('healthy')
    expect(vm.clusterHealth).toBe('critical')
    expect(vm.health).toBe('critical')
  })
})
