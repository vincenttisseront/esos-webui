import { describe, expect, it } from 'vitest'
import type { ClusterLvmNodeInventory } from '~/types/lvm'
import { buildClusterLvmViewModel } from '../utils/lvm-cluster-view-model'

function node(
  sanId: string,
  label: string,
  pvs: { path: string; vgName?: string }[] = [],
  vgs: { name: string }[] = [],
  lvs: { name: string; vgName: string; path: string; scst?: string[] }[] = [],
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
        sizeBytes: 1,
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
      lvs: lvs.map(l => ({
        name: l.name,
        path: l.path,
        vgName: l.vgName,
        sizeBytes: 1,
        uuid: 'u',
        active: true,
        usedBy: l.scst?.length ? ['scst'] as const : [],
        scstDeviceNames: l.scst,
      })),
      candidates: [],
      alerts: [],
    },
    mdArrayNames: [],
  }
}

describe('buildClusterLvmViewModel', () => {
  it('reports PV 1/2 when only primary has PV', () => {
    const vm = buildClusterLvmViewModel({
      primarySanId: 'n1',
      nodes: [
        node('n1', 'esos1', [{ path: '/dev/md0' }]),
        node('n2', 'esos2', []),
      ],
    })
    expect(vm?.summaryCounts.pv).toBe('1/2')
    expect(vm?.stepProgress.find(s => s.stepId === 'pv')?.ready).toBe(1)
    expect(vm?.nextAction.messageKey).toBe('lvm.cluster.view.next.pv_partial')
  })

  it('reports VG 2/2 when both nodes have same VG', () => {
    const vm = buildClusterLvmViewModel({
      primarySanId: 'n1',
      nodes: [
        node('n1', 'esos1', [{ path: '/dev/md0', vgName: 'data' }], [{ name: 'data' }]),
        node('n2', 'esos2', [{ path: '/dev/md0', vgName: 'data' }], [{ name: 'data' }]),
      ],
    })
    expect(vm?.summaryCounts.vg).toBe('2/2')
    expect(vm?.nextAction.kind).toBe('create_lv')
  })

  it('marks ssh-down node in comparison', () => {
    const down = node('n2', 'esos2')
    down.sshReady = false
    down.error = 'SSH non connecté'
    const vm = buildClusterLvmViewModel({
      primarySanId: 'n1',
      nodes: [node('n1', 'esos1', [{ path: '/dev/md0' }]), down],
    })
    expect(vm?.comparison.pvRows.some(r => r.status === 'ssh_down')).toBe(true)
  })
})
