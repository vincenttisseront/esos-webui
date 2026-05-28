import { describe, expect, it } from 'vitest'
import type { LvmCandidateDevice, LogicalVolume, PhysicalVolume, VolumeGroup } from '~/types/lvm'
import {
  buildProvisioningChain,
  computeLvmNextAction,
  pickSourcePath,
} from '../utils/lvm-provisioning-chain'

function cand(path: string, kind: LvmCandidateDevice['kind'] = 'md'): LvmCandidateDevice {
  return {
    path,
    kind,
    sizeBytes: 1,
    eligible: true,
    reasons: [],
    usedBy: [],
    signatures: [],
  }
}

function pv(path: string, vgName = ''): PhysicalVolume {
  return {
    path,
    vgName,
    sizeBytes: 1,
    freeBytes: 1,
    uuid: 'u',
    usedBy: [],
  }
}

function vg(name: string, freeBytes = 1_000_000): VolumeGroup {
  return {
    name,
    uuid: 'u',
    sizeBytes: 2_000_000,
    freeBytes,
    pvCount: 1,
    lvCount: 0,
    clustered: false,
  }
}

function lv(path: string, scst?: string[]): LogicalVolume {
  return {
    name: path.split('/').pop() ?? 'lv',
    path,
    vgName: 'vg0',
    sizeBytes: 1,
    uuid: 'u',
    active: true,
    usedBy: scst?.length ? ['scst'] : [],
    scstDeviceNames: scst,
  }
}

describe('lvm-provisioning-chain', () => {
  it('pickSourcePath prefers md over disk', () => {
    expect(
      pickSourcePath(
        [cand('/dev/sda', 'disk'), cand('/dev/md0', 'md')],
        [],
      ),
    ).toBe('/dev/md0')
  })

  it('empty with candidate → create_pv', () => {
    const action = computeLvmNextAction({
      candidates: [cand('/dev/md0')],
      pvs: [],
      vgs: [],
      lvs: [],
      orphanPvs: [],
    })
    expect(action.kind).toBe('create_pv')
    expect(action.messageParams?.path).toBe('/dev/md0')
    expect(action.nextStepId).toBe('pv')
  })

  it('empty without candidate → need_source', () => {
    const action = computeLvmNextAction({
      candidates: [],
      pvs: [],
      vgs: [],
      lvs: [],
      orphanPvs: [],
    })
    expect(action.kind).toBe('need_source')
    expect(action.action).toBe('block_devices')
  })

  it('orphan PV no VG → create_vg', () => {
    const action = computeLvmNextAction({
      candidates: [],
      pvs: [pv('/dev/md0')],
      vgs: [],
      lvs: [],
      orphanPvs: [pv('/dev/md0')],
    })
    expect(action.kind).toBe('create_vg')
    expect(action.messageParams?.path).toBe('/dev/md0')
  })

  it('VG with free space no LV → create_lv', () => {
    const action = computeLvmNextAction({
      candidates: [],
      pvs: [pv('/dev/md0', 'vg0')],
      vgs: [vg('vg0', 500)],
      lvs: [],
      orphanPvs: [],
    })
    expect(action.kind).toBe('create_lv')
    expect(action.targetVg).toBe('vg0')
  })

  it('LV without SCST → bind_scst', () => {
    const action = computeLvmNextAction({
      candidates: [],
      pvs: [pv('/dev/md0', 'vg0')],
      vgs: [vg('vg0')],
      lvs: [lv('/dev/vg0/lvol0')],
      orphanPvs: [],
    })
    expect(action.kind).toBe('bind_scst')
    expect(action.targetLv?.path).toBe('/dev/vg0/lvol0')
  })

  it('fully provisioned → complete', () => {
    const action = computeLvmNextAction({
      candidates: [],
      pvs: [pv('/dev/md0', 'vg0')],
      vgs: [vg('vg0')],
      lvs: [lv('/dev/vg0/lvol0', ['lun0'])],
      orphanPvs: [],
    })
    expect(action.kind).toBe('complete')
  })

  it('readOnly → readonly', () => {
    expect(
      computeLvmNextAction({
        candidates: [cand('/dev/md0')],
        pvs: [],
        vgs: [],
        lvs: [],
        orphanPvs: [],
        readOnly: true,
      }).kind,
    ).toBe('readonly')
  })

  it('buildProvisioningChain marks next step', () => {
    const chain = buildProvisioningChain({
      candidates: [cand('/dev/md0')],
      pvs: [],
      vgs: [],
      lvs: [],
      orphanPvs: [],
    })
    expect(chain.find(s => s.id === 'pv')?.status).toBe('next')
    expect(chain.find(s => s.id === 'source')?.detail).toContain('/dev/md0')
  })
})
