import { describe, it, expect } from 'vitest'
import type { LogicalVolume, LvmCandidateDevice, PhysicalVolume, VolumeGroup } from '~/types/lvm'
import {
  bindScstAvailability,
  clusterLvScstStateForKey,
  lvCanBindScst,
  lvCreateAvailability,
  lvScstUiState,
  pathsNotYetPv,
  pvCreateAvailability,
  resolveLvScstBinding,
  vgCreateAvailability,
  vgsWithFreeSpace,
} from '~/utils/lvm-action-availability'
import type { ClusterLvmNodeInventory } from '~/types/lvm'

const candidate = (path: string, eligible = true): LvmCandidateDevice => ({
  path,
  kind: 'disk',
  sizeBytes: 1e12,
  eligible,
  reasons: eligible ? [] : ['busy'],
  usedBy: [],
  signatures: [],
})

const pv = (path: string, vgName = ''): PhysicalVolume => ({
  path,
  vgName,
  sizeBytes: 1e12,
  freeBytes: vgName ? 0 : 1e12,
  uuid: path,
  usedBy: [],
})

const vg = (name: string, freeBytes: number): VolumeGroup => ({
  name,
  uuid: name,
  sizeBytes: 2e12,
  freeBytes,
  pvCount: 1,
  lvCount: 0,
  clustered: false,
})

const lv = (name: string, scstNames?: string[]): LogicalVolume => ({
  name,
  path: `/dev/mapper/data-${name}`,
  displayName: `data/${name}`,
  pathCandidates: [`/dev/mapper/data-${name}`, `/dev/data/${name}`],
  vgName: 'data',
  sizeBytes: 1e11,
  uuid: name,
  active: true,
  usedBy: scstNames?.length ? ['scst'] : [],
  scstDeviceNames: scstNames,
  scst: scstNames?.length
    ? { state: 'linked', deviceNames: scstNames }
    : { state: 'none', deviceNames: [] },
})

describe('pvCreateAvailability', () => {
  it('enabled when eligible candidate is not yet a PV', () => {
    const r = pvCreateAvailability({
      candidates: [candidate('/dev/sdb')],
      pvs: [],
      vgs: [],
      lvs: [],
      orphanPvs: [],
    })
    expect(r.enabled).toBe(true)
  })

  it('disabled when all eligible candidates are already PVs', () => {
    const r = pvCreateAvailability({
      candidates: [candidate('/dev/sdb')],
      pvs: [pv('/dev/sdb')],
      vgs: [],
      lvs: [],
      orphanPvs: [],
    })
    expect(r.enabled).toBe(false)
    expect(r.reasonKey).toBe('lvm.actions.disabled.all_devices_are_pv')
  })

  it('disabled when no eligible candidates', () => {
    const r = pvCreateAvailability({
      candidates: [candidate('/dev/sdb', false)],
      pvs: [],
      vgs: [],
      lvs: [],
      orphanPvs: [],
    })
    expect(r.enabled).toBe(false)
    expect(r.reasonKey).toBe('lvm.actions.disabled.no_pv_candidate')
  })
})

describe('vgCreateAvailability', () => {
  it('enabled with orphan PV', () => {
    const r = vgCreateAvailability({
      candidates: [],
      pvs: [pv('/dev/sdb')],
      vgs: [],
      lvs: [],
      orphanPvs: [pv('/dev/sdb')],
    })
    expect(r.enabled).toBe(true)
  })

  it('disabled without free PV', () => {
    const r = vgCreateAvailability({
      candidates: [],
      pvs: [pv('/dev/sdb', 'data')],
      vgs: [vg('data', 0)],
      lvs: [],
      orphanPvs: [],
    })
    expect(r.enabled).toBe(false)
    expect(r.reasonKey).toBe('lvm.actions.disabled.no_free_pv')
  })
})

describe('lvCreateAvailability', () => {
  it('enabled when VG has free space', () => {
    const r = lvCreateAvailability({
      candidates: [],
      pvs: [],
      vgs: [vg('data', 1e11)],
      lvs: [],
      orphanPvs: [],
    })
    expect(r.enabled).toBe(true)
  })

  it('disabled when no VG free space', () => {
    const r = lvCreateAvailability({
      candidates: [],
      pvs: [],
      vgs: [vg('data', 0)],
      lvs: [],
      orphanPvs: [],
    })
    expect(r.enabled).toBe(false)
    expect(r.reasonKey).toBe('lvm.actions.disabled.no_vg_free_space')
  })
})

describe('SCST path matching', () => {
  it('resolves device names by backing path candidates', () => {
    const map = new Map<string, string[]>([
      ['/dev/mapper/data-photos', ['lv_data_photos']],
    ])
    const binding = resolveLvScstBinding(
      ['/dev/mapper/data-photos', '/dev/data/photos'],
      map,
    )
    expect(binding.deviceNames).toEqual(['lv_data_photos'])
    expect(binding.state).toBe('linked')
  })

  it('lv without SCST can bind', () => {
    expect(lvCanBindScst(lv('vol1'))).toBe(true)
    expect(lvScstUiState(lv('vol1'))).toBe('none')
  })

  it('lv with SCST cannot bind again', () => {
    const bound = lv('vol1', ['dev1'])
    expect(lvCanBindScst(bound)).toBe(false)
    expect(lvScstUiState(bound)).toBe('linked')
  })

  it('bind action disabled when all LVs exposed', () => {
    const r = bindScstAvailability({
      candidates: [],
      pvs: [],
      vgs: [vg('data', 0)],
      lvs: [lv('a', ['d1']), lv('b', ['d2'])],
      orphanPvs: [],
    })
    expect(r.enabled).toBe(false)
    expect(r.reasonKey).toBe('lvm.actions.disabled.all_lv_scst_bound')
  })
})

describe('clusterLvScstStateForKey', () => {
  const inventory = (nodeScst: Record<string, string[] | undefined>): ClusterLvmNodeInventory[] => [
    {
      sanId: 'a',
      label: 'A',
      role: null,
      readOnly: false,
      sshReady: true,
      overview: {
        scannedAt: 0,
        tools: {} as never,
        pvs: [],
        vgs: [],
        lvs: [{
          ...lv('photos'),
          scstDeviceNames: nodeScst.a,
          scst: nodeScst.a?.length ? { state: 'linked', deviceNames: nodeScst.a } : undefined,
        }],
        candidates: [],
        alerts: [],
      },
      mdArrayNames: [],
    },
    {
      sanId: 'b',
      label: 'B',
      role: null,
      readOnly: false,
      sshReady: true,
      overview: {
        scannedAt: 0,
        tools: {} as never,
        pvs: [],
        vgs: [],
        lvs: [{
          ...lv('photos'),
          scstDeviceNames: nodeScst.b,
          scst: nodeScst.b?.length ? { state: 'linked', deviceNames: nodeScst.b } : undefined,
        }],
        candidates: [],
        alerts: [],
      },
      mdArrayNames: [],
    },
  ]

  it('partial when SCST on some nodes only', () => {
    const nodes = inventory({ a: ['dev'], b: undefined })
    expect(clusterLvScstStateForKey(nodes, 'data', 'photos')).toBe('partial')
  })

  it('linked when SCST on all nodes', () => {
    const nodes = inventory({ a: ['dev'], b: ['dev'] })
    expect(clusterLvScstStateForKey(nodes, 'data', 'photos')).toBe('linked')
  })
})

describe('pathsNotYetPv', () => {
  it('excludes paths already in pvs list', () => {
    expect(pathsNotYetPv([candidate('/dev/sdb')], [pv('/dev/sdb')])).toHaveLength(0)
  })
})

describe('vgsWithFreeSpace', () => {
  it('filters clustered and zero-free VGs', () => {
    expect(vgsWithFreeSpace([
      vg('a', 100),
      { ...vg('b', 0), clustered: true },
      vg('c', 0),
    ]).map(v => v.name)).toEqual(['a'])
  })
})
