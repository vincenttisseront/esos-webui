import { describe, expect, it } from 'vitest'
import { collectPendingHwRaidBackends } from '../utils/hw-raid-pending-backend'
import type { HardwareRaidController, RaidToolsInfo } from '../types/raid'

const tools: RaidToolsInfo = {
  mdadm: true,
  lspci: true,
  storcli: false,
  perccli: true,
  MegaCli64: false,
  arcconf: false,
  lsscsi: true,
  wipefs: true,
  parted: true,
  sfdisk: true,
  fdisk: true,
  partprobe: true,
  udevadm: true,
}

function controller(logicalDrives: HardwareRaidController['logicalDrives']): HardwareRaidController {
  return {
    id: '0',
    vendor: 'dell_perc',
    model: 'PERC',
    cliTool: 'perccli',
    detectionSource: ['cli'],
    managementMode: 'full',
    health: 'ok',
    supportsCreate: true,
    supportsDelete: true,
    supportsHotSpare: true,
    physicalDrives: [],
    logicalDrives,
    warnings: [],
  }
}

describe('collectPendingHwRaidBackends', () => {
  it('returns pending entry when VD has no OS path', () => {
    const rows = collectPendingHwRaidBackends([controller([{
      controllerId: '0',
      id: '0/vd1',
      raidLevel: '1',
      sizeBytes: 223 * 1024 ** 3,
      state: 'optimal',
      devicePath: '',
    }])], tools)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.vdId).toBe('0/vd1')
    expect(rows[0]?.status.osDeviceDetected).toBe(false)
    expect(rows[0]?.status.pendingRescan).toBe(true)
  })

  it('skips mapped VD', () => {
    const rows = collectPendingHwRaidBackends([controller([{
      controllerId: '0',
      id: '0/vd2',
      raidLevel: '1',
      sizeBytes: 100,
      state: 'optimal',
      devicePath: '/dev/sdb',
    }])], tools)
    expect(rows).toHaveLength(0)
  })
})
