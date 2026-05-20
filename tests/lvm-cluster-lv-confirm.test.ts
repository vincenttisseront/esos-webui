import { describe, expect, it } from 'vitest'
import type { ClusterLvmNodeInventory } from '../types/lvm'
import { buildClusterLvConfirmChecks, clusterLvConfirmBlocked } from '../utils/lvm-cluster-lv-confirm'

function node(
  label: string,
  vgFree: number,
  opts: { hasVg?: boolean; hasLv?: boolean; lvcreate?: boolean } = {},
): ClusterLvmNodeInventory {
  const hasVg = opts.hasVg !== false
  return {
    sanId: label,
    label,
    role: null,
    readOnly: false,
    sshReady: true,
    overview: {
      scannedAt: 0,
      tools: {
        pvs: true, vgs: true, lvs: true, pvcreate: true, vgcreate: true,
        lvcreate: opts.lvcreate !== false, vgremove: true, lvremove: true,
        pvremove: true, wipefs: true, blkid: true,
      },
      pvs: [],
      vgs: hasVg ? [{ name: 'data', sizeBytes: vgFree * 2, freeBytes: vgFree, clustered: false }] : [],
      lvs: opts.hasLv ? [{ name: 'photos', vgName: 'data', path: '/dev/data/photos', sizeBytes: 1, scstDeviceNames: [] }] : [],
      candidates: [],
      alerts: [],
    },
    mdArrayNames: [],
  }
}

describe('lvm-cluster-lv-confirm', () => {
  it('passes when VG exists, LV absent, space OK, plan symmetric', () => {
    const checks = buildClusterLvConfirmChecks({
      vgName: 'data',
      lvName: 'photos',
      sizeBytes: 10 * 1024 ** 3,
      preflight: {
        ok: true,
        blockers: [],
        warnings: [],
        mappings: [],
        symmetryIssues: [],
        nodes: [node('esos1', 50 * 1024 ** 3), node('esos2', 50 * 1024 ** 3)],
      },
      plan: {
        action: 'lvcreate',
        primarySanId: 'esos1',
        confirmationPhrase: 'LVCREATE CLUSTER data/photos',
        okSymmetric: true,
        warnings: [],
        blockers: [],
        nodeResults: [
          { sanId: 'esos1', label: 'esos1', participation: 'execute', command: 'lvcreate -y -v -L 10G -n photos data' },
          { sanId: 'esos2', label: 'esos2', participation: 'execute', command: 'lvcreate -y -v -L 10G -n photos data' },
        ],
      },
    })
    expect(checks.every(c => c.ok)).toBe(true)
    expect(clusterLvConfirmBlocked(checks, { okSymmetric: true } as any)).toBe(false)
  })

  it('fails when LV already exists', () => {
    const checks = buildClusterLvConfirmChecks({
      vgName: 'data',
      lvName: 'photos',
      sizeBytes: 10 * 1024 ** 3,
      preflight: {
        ok: false,
        blockers: ['esos2 : LV data/photos existe déjà'],
        warnings: [],
        mappings: [],
        symmetryIssues: [],
        nodes: [node('esos1', 50 * 1024 ** 3), node('esos2', 50 * 1024 ** 3, { hasLv: true })],
      },
      plan: null,
    })
    expect(checks.find(c => c.id === 'lv_not_exists')?.ok).toBe(false)
  })
})
