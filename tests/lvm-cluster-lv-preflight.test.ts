import { describe, expect, it } from 'vitest'
import { buildClusterLvConfirmChecks } from '../utils/lvm-cluster-lv-confirm'
import type { ClusterLvmNodeInventory } from '../types/lvm'

function node(label: string, opts: { hasLv?: boolean; freeGiB?: number; hasVg?: boolean } = {}): ClusterLvmNodeInventory {
  const free = (opts.freeGiB ?? 50) * 1024 ** 3
  return {
    sanId: label,
    label,
    role: null,
    readOnly: false,
    sshReady: true,
    overview: {
      scannedAt: 0,
      tools: {
        pvs: true, vgs: true, lvs: true, pvcreate: true, vgcreate: true, lvcreate: true,
        vgremove: true, lvremove: true, pvremove: true, wipefs: true, blkid: true,
      },
      pvs: [],
      vgs: opts.hasVg === false ? [] : [{ name: 'data', sizeBytes: free * 2, freeBytes: free, clustered: false, uuid: '', pvCount: 1, lvCount: 0, attr: '' }],
      lvs: opts.hasLv ? [{ name: 'photos', vgName: 'data', path: '/dev/data/photos', sizeBytes: 1, uuid: '', attr: '', active: true }] : [],
      candidates: [],
      alerts: [],
    },
    mdArrayNames: [],
  }
}

describe('cluster LV duplicate preflight', () => {
  it('blocks when LV exists on a node', () => {
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
        nodes: [node('esos1'), node('esos2', { hasLv: true })],
      },
      plan: null,
    })
    expect(checks.find(c => c.id === 'lv_not_exists')?.ok).toBe(false)
  })
})
