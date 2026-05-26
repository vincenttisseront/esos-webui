import { describe, expect, it } from 'vitest'
import type { FsBackendRef } from '~/types/filesystem'
import type { LogicalVolume } from '~/types/lvm'
import { FS_BACKEND_REASON } from '~/utils/fs-backend-reasons'
import {
  analyzeFileioBackendSituation,
  listBlockioBoundLvs,
} from '~/utils/storage-workflow-guidance'
import { classifyLvFileioUsage, isBlockProvisioningComplete } from '~/utils/lvm-lv-usage'

const lv: LogicalVolume = {
  name: 'lv_data_photos',
  displayName: 'lv_data_photos',
  path: '/dev/mapper/data-photos',
  vgName: 'data',
  sizeBytes: 1e12,
  uuid: 'u1',
  active: true,
  usedBy: ['scst'],
  scstDeviceNames: ['PHOTOS'],
}

describe('storage-workflow-guidance', () => {
  it('detects blockio-only FILEIO gap', () => {
    const backends: FsBackendRef[] = [{
      path: '/dev/mapper/data-photos',
      kind: 'lvm_lv',
      eligible: false,
      reasons: [FS_BACKEND_REASON.SCST_BLOCKIO],
      sizeBytes: 1e12,
      displayName: 'lv_data_photos',
    }]
    const situation = analyzeFileioBackendSituation({
      backends,
      lvs: [lv],
      vgs: [{ name: 'data', freeBytes: 0 }],
      fileioTrackConfigured: false,
    })
    expect(situation.blockioOnlyGap).toBe(true)
    expect(situation.exposure.health).toBe('ok')
    expect(situation.blockProvisioningComplete).toBe(true)
    expect(situation.blockioBoundLvs).toHaveLength(1)
    expect(situation.suggestedLvName).toBe('fileio_store')
  })

  it('lists blockio-bound LVs from backends', () => {
    const rows = listBlockioBoundLvs([{
      path: '/dev/mapper/data-photos',
      kind: 'lvm_lv',
      eligible: false,
      reasons: [FS_BACKEND_REASON.SCST_BLOCKIO],
      sizeBytes: 1,
    }], [lv])
    expect(rows[0]?.displayName).toBe('lv_data_photos')
  })
})

describe('lvm-lv-usage', () => {
  it('marks SCST-bound LV as blockio usage', () => {
    expect(classifyLvFileioUsage(lv).usage).toBe('scst_blockio')
  })

  it('marks eligible path as fileio backend', () => {
    const freeLv: LogicalVolume = { ...lv, usedBy: [], scstDeviceNames: [], path: '/dev/mapper/data-fileio' }
    expect(classifyLvFileioUsage(freeLv, {
      fileioEligiblePaths: ['/dev/mapper/data-fileio'],
    }).usage).toBe('fileio_backend')
  })

  it('detects block provisioning complete when all LVs bound', () => {
    expect(isBlockProvisioningComplete([lv])).toBe(true)
  })
})
