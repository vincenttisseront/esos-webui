import { describe, expect, it } from 'vitest'
import { mapPvPathToPeer } from '../server/utils/lvm-cluster-preflight'
import type { ClusterLvmNodeInventory } from '../types/lvm'
import type { MdArray } from '../types/raid'

function node(sanId: string, mdArrays: MdArray[], candidates: ClusterLvmNodeInventory['overview']['candidates'] = []): ClusterLvmNodeInventory {
  return {
    sanId,
    label: sanId,
    role: null,
    readOnly: false,
    sshReady: true,
    mdArrayNames: mdArrays.map(a => a.name),
    mdArrays,
    blockDevices: [],
    overview: {
      scannedAt: 0,
      tools: { pvs: true, vgs: true, lvs: true, pvcreate: true, vgcreate: true, lvcreate: true, vgremove: true, lvremove: true, pvremove: true, wipefs: true, blkid: true },
      pvs: [],
      vgs: [],
      lvs: [],
      candidates,
      alerts: [],
    },
  }
}

function md(name: string, sizeBytes: number): MdArray {
  return {
    name,
    path: `/dev/${name}`,
    state: 'clean',
    raidLevel: '1',
    raidDevices: 2,
    activeDevices: 2,
    workingDevices: 2,
    failedDevices: 0,
    spareDevices: 0,
    sizeBytes,
    usedBy: [],
    warnings: [],
    members: [],
  }
}

describe('mapPvPathToPeer', () => {
  it('maps /dev/md0 to same path when structurally symmetric', () => {
    const source = node('n1', [md('md0', 100)])
    const peer = node('n2', [md('md0', 100)], [{
      path: '/dev/md0',
      kind: 'md',
      sizeBytes: 100,
      eligible: true,
      reasons: [],
      usedBy: [],
      signatures: [],
    }])
    const result = mapPvPathToPeer('/dev/md0', source, peer)
    expect(result.peerPath).toBe('/dev/md0')
    expect(result.confidence).toBe('high')
    expect(result.blockers).toHaveLength(0)
  })

  it('blocks when peer MD size mismatches', () => {
    const source = node('n1', [md('md0', 100 * 1024 ** 3)])
    const peer = node('n2', [md('md0', 200 * 1024 ** 3)])
    const result = mapPvPathToPeer('/dev/md0', source, peer)
    expect(result.peerPath).toBeUndefined()
    expect(result.blockers.length).toBeGreaterThan(0)
  })
})
