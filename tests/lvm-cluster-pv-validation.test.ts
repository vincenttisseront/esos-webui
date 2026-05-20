import { describe, expect, it } from 'vitest'
import { validateClusterPvCreatePaths } from '../server/utils/lvm-cluster-pv-validation'
import type { ClusterLvmNodeInventory } from '../server/utils/lvm-types'

function node(
  sanId: string,
  label: string,
  pvs: ClusterLvmNodeInventory['overview']['pvs'] = [],
): ClusterLvmNodeInventory {
  return {
    sanId,
    label,
    role: null,
    readOnly: false,
    sshReady: true,
    overview: {
      scannedAt: 0,
      tools: { pvs: true, vgs: true, lvs: true, pvcreate: true, vgcreate: true, lvcreate: true, vgremove: true, lvremove: true, pvremove: true, wipefs: true, blkid: true },
      pvs,
      vgs: [],
      lvs: [],
      candidates: [{
        path: '/dev/md0',
        kind: 'md',
        sizeBytes: 100 * 1024 ** 3,
        eligible: true,
        reasons: [],
        usedBy: [],
        signatures: [],
      }],
      alerts: [],
    },
    mdArrayNames: ['md0'],
    mdArrays: [{ name: 'md0', path: '/dev/md0', state: 'clean', raidLevel: '1', raidDevices: 2, activeDevices: 2, workingDevices: 2, failedDevices: 0, spareDevices: 0, sizeBytes: 100 * 1024 ** 3, usedBy: [], warnings: [], members: [] }],
    blockDevices: [],
  }
}

describe('validateClusterPvCreatePaths', () => {
  it('blocks when PV already exists on a node', () => {
    const blockers = validateClusterPvCreatePaths(
      'n1',
      '/dev/md0',
      [
        node('n1', 'esos1'),
        node('n2', 'esos2', [{ path: '/dev/md0', vgName: '', sizeBytes: 1, freeBytes: 1, uuid: 'x', usedBy: [] }]),
      ],
      [{ sourceSanId: 'n1', peerSanId: 'n2', sourcePath: '/dev/md0', peerPath: '/dev/md0' }],
      false,
    )
    expect(blockers.some(b => b.includes('esos2') && b.includes('PV déjà présent'))).toBe(true)
  })

  it('passes when no PV on any node and devices eligible', () => {
    const blockers = validateClusterPvCreatePaths(
      'n1',
      '/dev/md0',
      [node('n1', 'esos1'), node('n2', 'esos2')],
      [{ sourceSanId: 'n1', peerSanId: 'n2', sourcePath: '/dev/md0', peerPath: '/dev/md0' }],
      false,
    )
    expect(blockers.filter(b => /PV déjà présent/i.test(b))).toHaveLength(0)
  })
})
