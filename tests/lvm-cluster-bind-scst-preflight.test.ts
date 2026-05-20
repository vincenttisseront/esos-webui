import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClusterLvmNodeInventory } from '../types/lvm'

const { runLvmPreflight, getSSHPool } = vi.hoisted(() => ({
  runLvmPreflight: vi.fn(),
  getSSHPool: vi.fn(),
}))

vi.mock('../server/utils/lvm-preflight', () => ({ runLvmPreflight }))
vi.mock('../server/utils/ssh-pool', () => ({ getSSHPool }))
vi.mock('../server/utils/ssh-runtime', () => ({
  withSanContext: (_id: string, fn: () => unknown) => fn(),
}))

import {
  preflightBindScstOnClusterNodes,
  validateBindScstClusterPayload,
  bindScstPreflightHasConflictOnly,
} from '../server/utils/lvm-cluster-bind-scst-preflight'

function node(label: string, opts: { sshReady?: boolean; hasLv?: boolean } = {}): ClusterLvmNodeInventory {
  return {
    sanId: label,
    label,
    role: null,
    readOnly: false,
    sshReady: opts.sshReady ?? true,
    overview: {
      scannedAt: 0,
      tools: {
        pvs: true, vgs: true, lvs: true, pvcreate: true, vgcreate: true, lvcreate: true,
        vgremove: true, lvremove: true, pvremove: true, wipefs: true, blkid: true,
      },
      pvs: [],
      vgs: [{ name: 'data', sizeBytes: 1e12, freeBytes: 1e11, clustered: false, uuid: 'u', pvCount: 1, lvCount: 1 }],
      lvs: opts.hasLv === false ? [] : [{
        name: 'photos',
        vgName: 'data',
        path: '/dev/data/photos',
        sizeBytes: 1e9,
        uuid: 'l',
        active: true,
        usedBy: [],
      }],
      candidates: [],
      alerts: [],
    },
    mdArrayNames: [],
  }
}

describe('lvm-cluster-bind-scst-preflight', () => {
  beforeEach(() => {
    runLvmPreflight.mockReset()
    getSSHPool.mockReset()
    getSSHPool.mockReturnValue({
      get: () => ({ getStatus: () => 'connected' }),
    })
  })

  it('validateBindScstClusterPayload rejects empty device name', () => {
    const r = validateBindScstClusterPayload({ vgName: 'data', lvName: 'photos', deviceName: '' })
    expect(r.ok).toBe(false)
  })

  it('preflightBindScstOnClusterNodes returns perNode without throwing when SSH exec fails', async () => {
    runLvmPreflight.mockRejectedValue(new Error('SSH exec timeout'))
    const result = await preflightBindScstOnClusterNodes(
      [node('esos1'), node('esos2')],
      { vgName: 'data', lvName: 'photos', deviceName: 'lv_data_photos', confirmation: '' },
    )
    expect(result.perNode).toHaveLength(2)
    expect(result.perNode.every(n => !n.ok)).toBe(true)
    expect(result.blockers.some(b => b.includes('esos1'))).toBe(true)
  })

  it('preflightBindScstOnClusterNodes marks unreachable SSH nodes', async () => {
    const offline = node('esos2', { sshReady: false })
    const result = await preflightBindScstOnClusterNodes(
      [node('esos1'), offline],
      { vgName: 'data', lvName: 'photos', deviceName: 'lv_data_photos', confirmation: '' },
    )
    expect(result.perNode.find(n => n.label === 'esos2')?.blockers[0]).toContain('SSH')
    runLvmPreflight.mockResolvedValue({ ok: true, blockers: [], warnings: [] })
    expect(runLvmPreflight).toHaveBeenCalledTimes(1)
  })

  it('bindScstPreflightHasConflictOnly detects structured device_exists blockers', () => {
    expect(bindScstPreflightHasConflictOnly([
      'BIND_SCST:device_exists:lv_data_photos:esos1',
    ])).toBe(true)
    expect(bindScstPreflightHasConflictOnly([
      'BIND_SCST:device_exists:lv_data_photos:esos1',
      'esos2 : SSH non disponible',
    ])).toBe(false)
  })
})
