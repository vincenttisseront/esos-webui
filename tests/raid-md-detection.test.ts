import { describe, expect, it } from 'vitest'
import {
  buildCreateMdBlockerRefs,
  buildMdDetectionSummary,
  prefixBlockerRefs,
} from '../server/utils/raid-md-detection'
import type { MdArray, RaidBlockDevice, StoppedMdArray } from '../server/utils/raid-types'
import {
  blockDeviceRaidItems,
  hasAnyMdStateVisible,
  partitionMetadataItems,
  peerNodesWithMdState,
} from '../utils/raid-md-detection'
import type { RaidOverviewResponse } from '../types/raid'

function partDevice(overrides: Partial<RaidBlockDevice> & { path: string }): RaidBlockDevice {
  return {
    name: overrides.path.replace('/dev/', ''),
    path: overrides.path,
    sizeBytes: 1_000_000,
    type: 'part',
    usedBy: [],
    eligibleForMd: false,
    eligibleForHardwareRaid: false,
    mdEligibilityReasons: [],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    warnings: [],
    partitionTypeCode: '0xfd',
    partitionTypeName: 'Linux RAID Autodetect',
    ...overrides,
  }
}

describe('buildMdDetectionSummary', () => {
  const ctx = { nodeSanId: 'san-1', nodeLabel: 'esos1' }

  it('detects active_kernel from mdArrays', () => {
    const mdArrays: MdArray[] = [{
      name: 'md0',
      path: '/dev/md0',
      raidLevel: '1',
      state: 'active',
      raidDevices: 2,
      members: [],
    }]
    const summary = buildMdDetectionSummary({ ...ctx, mdArrays, stoppedMdArrays: [], blockDevices: [] })
    expect(summary.hasAnyMdState).toBe(true)
    expect(summary.items.some(i => i.kind === 'active_kernel' && i.path === '/dev/md0')).toBe(true)
  })

  it('detects stopped_scan without members', () => {
    const stoppedMdArrays: StoppedMdArray[] = [{
      name: 'md0',
      path: '/dev/md0',
      raidLevel: '1',
      raidDevices: 2,
      stoppedState: 'assemblable',
      warnings: [],
      detectedOn: 'scan',
      members: [],
    }]
    const summary = buildMdDetectionSummary({ ...ctx, mdArrays: [], stoppedMdArrays, blockDevices: [] })
    expect(summary.items.some(i => i.kind === 'stopped_scan')).toBe(true)
    expect(summary.hasAnyMdState).toBe(true)
  })

  it('detects block_device_raid when lsblk shows md0 but mdstat is empty', () => {
    const blockDevices: RaidBlockDevice[] = [{
      name: 'md0',
      path: '/dev/md0',
      sizeBytes: 1_000_000,
      type: 'raid',
      usedBy: [],
      eligibleForMd: false,
      eligibleForHardwareRaid: false,
      mdEligibilityReasons: [],
      eligibleForMdPartitionPrep: false,
      mdPartitionPrepReasons: [],
      warnings: [],
    }]
    const summary = buildMdDetectionSummary({ ...ctx, mdArrays: [], stoppedMdArrays: [], blockDevices })
    expect(summary.items.some(i => i.kind === 'block_device_raid')).toBe(true)
    expect(summary.hasAnyMdState).toBe(true)
  })

  it('detects partition_metadata when superblock present but not in stopped members', () => {
    const blockDevices = [
      partDevice({
        path: '/dev/sdb1',
        hasMdSuperblock: true,
        usedBy: ['md'],
        mdEligibilityReasons: ['Superblock MD existant détecté'],
      }),
    ]
    const summary = buildMdDetectionSummary({ ...ctx, mdArrays: [], stoppedMdArrays: [], blockDevices })
    expect(summary.items.some(i => i.kind === 'partition_metadata' && i.path === '/dev/sdb1')).toBe(true)
    expect(summary.hasAnyMdState).toBe(true)
  })

  it('does not emit partition_metadata or orphan stopped_examine for active array members with superblocks', () => {
    const mdArrays: MdArray[] = [{
      name: 'md0',
      path: '/dev/md0',
      raidLevel: '1',
      state: 'clean',
      raidDevices: 2,
      members: [
        { path: '/dev/sdb1', slot: 0, state: ['active', 'sync'] },
        { path: '/dev/sdc1', slot: 1, state: ['active', 'sync'] },
      ],
    }]
    const blockDevices = [
      partDevice({ path: '/dev/sdb1', hasMdSuperblock: true, usedBy: ['md'] }),
      partDevice({ path: '/dev/sdc1', hasMdSuperblock: true, usedBy: ['md'] }),
    ]
    const summary = buildMdDetectionSummary({ ...ctx, mdArrays, stoppedMdArrays: [], blockDevices })
    expect(summary.items.filter(i => i.kind === 'partition_metadata')).toHaveLength(0)
    expect(summary.items.filter(i => i.kind === 'stopped_examine' && i.recommendedAction === 'zero_superblock')).toHaveLength(0)
    expect(summary.items.some(i => i.kind === 'active_kernel' && i.path === '/dev/md0')).toBe(true)
  })

  it('skips stopped_examine for member path that is also in active mdArrays', () => {
    const mdArrays: MdArray[] = [{
      name: 'md0',
      path: '/dev/md0',
      raidLevel: '1',
      state: 'active',
      raidDevices: 2,
      members: [{ path: '/dev/sdb1', slot: 0, state: ['active', 'sync'] }],
    }]
    const stoppedMdArrays: StoppedMdArray[] = [{
      name: 'md0',
      raidLevel: '1',
      raidDevices: 2,
      stoppedState: 'incomplete',
      warnings: [],
      detectedOn: 'both',
      members: [{ path: '/dev/sdb1', present: true, memberStatus: 'orphan_metadata' }],
    }]
    const summary = buildMdDetectionSummary({ ...ctx, mdArrays, stoppedMdArrays, blockDevices: [] })
    expect(summary.items.filter(i => i.path === '/dev/sdb1' && i.kind === 'stopped_examine')).toHaveLength(0)
  })

  it('skips partition_metadata when path is already a stopped examine member', () => {
    const stoppedMdArrays: StoppedMdArray[] = [{
      name: 'md0',
      raidLevel: '1',
      raidDevices: 2,
      stoppedState: 'incomplete',
      warnings: [],
      detectedOn: 'both',
      members: [{ path: '/dev/sdb1', present: true, memberStatus: 'incomplete' }],
    }]
    const blockDevices = [partDevice({ path: '/dev/sdb1', hasMdSuperblock: true, usedBy: ['md'] })]
    const summary = buildMdDetectionSummary({ ...ctx, mdArrays: [], stoppedMdArrays, blockDevices })
    expect(summary.items.filter(i => i.kind === 'partition_metadata')).toHaveLength(0)
    expect(summary.items.some(i => i.kind === 'stopped_examine')).toBe(true)
  })
})

describe('buildCreateMdBlockerRefs', () => {
  it('emits md_block_device_exists when block device path collides', () => {
    const refs = buildCreateMdBlockerRefs({
      sanId: 'san-2',
      name: 'md0',
      mdArrays: [],
      blockDevices: [{
        name: 'md0',
        path: '/dev/md0',
        sizeBytes: 1,
        type: 'raid',
        usedBy: [],
        eligibleForMd: false,
        eligibleForHardwareRaid: false,
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        warnings: [],
      }],
      deviceBlockers: [],
    })
    expect(refs).toHaveLength(1)
    expect(refs[0].code).toBe('md_block_device_exists')
    expect(refs[0].sanId).toBe('san-2')
    expect(refs[0].uiAnchor).toBe('software-stopped')
  })

  it('prefixBlockerRefs attaches peer sanId and label', () => {
    const refs = prefixBlockerRefs([{
      code: 'md_block_device_exists',
      message: '/dev/md0 existe déjà comme block device',
      path: '/dev/md0',
      uiAnchor: 'software-stopped',
    }], 'esos2', 'peer-san')
    expect(refs[0].message).toContain('esos2')
    expect(refs[0].sanId).toBe('peer-san')
  })
})

describe('client raid-md-detection helpers', () => {
  const emptyOverview = (): RaidOverviewResponse => ({
    scannedAt: 0,
    tools: {} as RaidOverviewResponse['tools'],
    hardwareControllers: [],
    mdArrays: [],
    stoppedMdArrays: [],
    blockDevices: [],
    alerts: [],
    mdDetection: { nodeSanId: 'a', nodeLabel: 'A', hasAnyMdState: false, items: [] },
  })

  it('hasAnyMdStateVisible is false when only legacy arrays are empty', () => {
    expect(hasAnyMdStateVisible(emptyOverview())).toBe(false)
  })

  it('hasAnyMdStateVisible includes cluster peer state', () => {
    const overview = emptyOverview()
    overview.clusterMdDetection = [{
      nodeSanId: 'peer',
      nodeLabel: 'esos2',
      hasAnyMdState: true,
      items: [{
        kind: 'block_device_raid',
        path: '/dev/md0',
        nodeSanId: 'peer',
        nodeLabel: 'esos2',
        severity: 'warning',
        summary: 'peer md0',
        reasons: [],
        uiAnchor: 'software-stopped',
      }],
    }]
    expect(hasAnyMdStateVisible(overview)).toBe(true)
    expect(peerNodesWithMdState(overview, 'a')).toHaveLength(1)
  })

  it('partitionMetadataItems and blockDeviceRaidItems filter current node items', () => {
    const overview = emptyOverview()
    overview.mdDetection = {
      nodeSanId: 'a',
      nodeLabel: 'A',
      hasAnyMdState: true,
      items: [
        {
          kind: 'partition_metadata',
          path: '/dev/sdb1',
          nodeSanId: 'a',
          nodeLabel: 'A',
          severity: 'blocking',
          summary: 'meta',
          reasons: [],
          uiAnchor: 'devices',
        },
        {
          kind: 'block_device_raid',
          path: '/dev/md0',
          nodeSanId: 'a',
          nodeLabel: 'A',
          severity: 'warning',
          summary: 'inactive',
          reasons: [],
          uiAnchor: 'software-stopped',
        },
      ],
    }
    expect(partitionMetadataItems(overview)).toHaveLength(1)
    expect(blockDeviceRaidItems(overview)).toHaveLength(1)
    expect(hasAnyMdStateVisible(overview)).toBe(true)
  })
})
