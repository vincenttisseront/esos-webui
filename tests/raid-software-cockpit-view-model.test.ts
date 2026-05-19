import { describe, expect, it } from 'vitest'
import {
  buildRaidSoftwareCockpitViewModel,
  filterCockpitRecommendedActions,
} from '../utils/raid-software-cockpit-view-model'
import type { RaidGroupedActionableItem } from '../types/raid'

const t = (key: string) => key

describe('filterCockpitRecommendedActions', () => {
  it('excludes resync category from recommended actions', () => {
    const items: RaidGroupedActionableItem[] = [
      {
        groupKey: 'resync',
        severity: 'info',
        title: 'Resync',
        impact: '',
        recommendation: '',
        affectedPaths: [],
        representative: {
          id: 'resync:md0',
          severity: 'info',
          category: 'resync',
          title: 'Resync',
          impact: '',
          recommendation: '',
          details: [],
        },
      },
      {
        groupKey: 'meta',
        severity: 'warning',
        title: 'Meta',
        impact: '',
        recommendation: '',
        affectedPaths: ['/dev/sdb1'],
        representative: {
          id: 'm1',
          severity: 'warning',
          category: 'metadata_local',
          title: 'Meta',
          impact: '',
          recommendation: '',
          details: [],
        },
      },
    ]
    const filtered = filterCockpitRecommendedActions(items)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.representative.category).toBe('metadata_local')
  })
})

describe('buildRaidSoftwareCockpitViewModel', () => {
  it('orders recommended actions without resync items', () => {
    const vm = buildRaidSoftwareCockpitViewModel({
      overview: {
        scannedAt: 0,
        tools: { mdadm: true, lspci: false, storcli: false, perccli: false, MegaCli64: false, arcconf: false, lsscsi: false, wipefs: false, parted: false, sfdisk: false, fdisk: false, partprobe: false, udevadm: false },
        hardwareControllers: [],
        mdArrays: [{
          name: 'md0',
          path: '/dev/md0',
          raidLevel: '1',
          state: 'resync',
          raidDevices: 2,
          activeDevices: 2,
          workingDevices: 2,
          failedDevices: 0,
          spareDevices: 0,
          members: [],
          usedBy: [],
          warnings: [],
          progress: { action: 'resync', percent: 50, speedKbps: 1000 },
        }],
        stoppedMdArrays: [],
        blockDevices: [],
        alerts: [],
        mdDetection: { nodeSanId: 'a', nodeLabel: 'a', hasAnyMdState: true, items: [] },
      },
      currentSanId: 'a',
      isClustered: false,
      stoppedAssemblable: [],
      stoppedOrphan: [],
      showEmptyMdState: false,
      t,
    })
    expect(vm.hasActiveArrays).toBe(true)
    expect(vm.recommendedActions.every(g => g.representative.category !== 'resync')).toBe(true)
  })
})
