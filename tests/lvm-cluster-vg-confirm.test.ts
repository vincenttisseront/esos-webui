import { describe, expect, it } from 'vitest'
import type { ClusterLvmNodeInventory, ClusterLvmPreflightResult } from '~/types/lvm'
import {
  buildClusterVgConfirmChecks,
  clusterVgConfirmBlocked,
  extractVgExistsBlockers,
} from '../utils/lvm-cluster-vg-confirm'

function node(
  sanId: string,
  label: string,
  pvs: { path: string; vgName?: string; sizeBytes?: number }[],
  vgs: { name: string }[] = [],
): ClusterLvmNodeInventory {
  return {
    sanId,
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
      pvs: pvs.map(p => ({
        path: p.path,
        vgName: p.vgName ?? '',
        sizeBytes: p.sizeBytes ?? 1,
        freeBytes: 1,
        uuid: 'u',
        usedBy: [],
      })),
      vgs: vgs.map(v => ({
        name: v.name,
        uuid: 'u',
        sizeBytes: 1,
        freeBytes: 1,
        pvCount: 1,
        lvCount: 0,
        clustered: false,
      })),
      lvs: [],
      candidates: [],
      alerts: [],
    },
    mdArrayNames: [],
  }
}

describe('lvm-cluster-vg-confirm', () => {
  it('extractVgExistsBlockers finds per-node VG messages', () => {
    expect(extractVgExistsBlockers(['esos2 : VG data existe déjà'])).toHaveLength(1)
  })

  it('blocks when VG exists on a node', () => {
    const preflight: ClusterLvmPreflightResult = {
      ok: false,
      blockers: ['esos2 : VG data existe déjà'],
      warnings: [],
      mappings: [],
      symmetryIssues: [],
      nodes: [
        node('n1', 'esos1', [{ path: '/dev/md0' }]),
        node('n2', 'esos2', [{ path: '/dev/md0' }], [{ name: 'data' }]),
      ],
    }
    const checks = buildClusterVgConfirmChecks({
      vgName: 'data',
      pvPaths: ['/dev/md0'],
      primarySanId: 'n1',
      mappings: [],
      preflight,
      plan: null,
    })
    expect(checks.find(c => c.id === 'vg_not_exists')?.ok).toBe(false)
    expect(clusterVgConfirmBlocked(checks, null)).toBe(true)
  })

  it('passes when PV free on all nodes', () => {
    const preflight: ClusterLvmPreflightResult = {
      ok: true,
      blockers: [],
      warnings: [],
      mappings: [],
      symmetryIssues: [],
      nodes: [
        node('n1', 'esos1', [{ path: '/dev/md0' }]),
        node('n2', 'esos2', [{ path: '/dev/md0' }]),
      ],
    }
    const checks = buildClusterVgConfirmChecks({
      vgName: 'data',
      pvPaths: ['/dev/md0'],
      primarySanId: 'n1',
      mappings: [],
      preflight,
      plan: {
        action: 'vgcreate',
        primarySanId: 'n1',
        confirmationPhrase: 'VGCREATE CLUSTER data',
        okSymmetric: true,
        blockers: [],
        warnings: [],
        nodeResults: [
          { sanId: 'n1', label: 'esos1', participation: 'execute', command: 'vgcreate -v data /dev/md0' },
          { sanId: 'n2', label: 'esos2', participation: 'execute', command: 'vgcreate -v data /dev/md0' },
        ],
      },
    })
    expect(checks.every(c => c.ok)).toBe(true)
  })
})
