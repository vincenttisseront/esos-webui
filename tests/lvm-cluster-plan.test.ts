import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildClusterPvCreatePlan,
  buildClusterVgCreatePlan,
  buildClusterLvCreatePlan,
} from '../server/utils/lvm-cluster-execution'
import * as preflightMod from '../server/utils/lvm-cluster-preflight'

vi.mock('../server/db', () => ({
  getDB: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [
            { id: 'n1', label: 'esos1' },
            { id: 'n2', label: 'esos2' },
          ]),
        })),
      })),
    })),
  })),
}))

vi.mock('../server/db/schema', () => ({ sans: {} }))

const mockPreflight = {
  ok: true,
  blockers: [],
  warnings: [],
  mappings: [{ sourceSanId: 'n1', peerSanId: 'n2', sourcePath: '/dev/md0', peerPath: '/dev/md0' }],
  symmetryIssues: [],
  nodes: [
    {
      sanId: 'n1',
      label: 'esos1',
      role: null,
      readOnly: false,
      sshReady: true,
      overview: { pvs: [], vgs: [], lvs: [], candidates: [], tools: {}, alerts: [], scannedAt: 0 },
      mdArrayNames: ['md0'],
      mdArrays: [],
      blockDevices: [],
    },
    {
      sanId: 'n2',
      label: 'esos2',
      role: null,
      readOnly: false,
      sshReady: true,
      overview: { pvs: [], vgs: [], lvs: [], candidates: [], tools: {}, alerts: [], scannedAt: 0 },
      mdArrayNames: ['md0'],
      mdArrays: [],
      blockDevices: [],
    },
  ],
}

describe('buildClusterPvCreatePlan', () => {
  beforeEach(() => {
    vi.spyOn(preflightMod, 'runClusterLvmPreflight').mockResolvedValue(mockPreflight as any)
  })

  it('builds execute plan with pvcreate -v on all nodes', async () => {
    const plan = await buildClusterPvCreatePlan('n1', 'cluster-1', {
      path: '/dev/md0',
      confirmation: '',
    })
    expect(plan.okSymmetric).toBe(true)
    expect(plan.nodeResults).toHaveLength(2)
    expect(plan.nodeResults.every(n => n.participation === 'execute')).toBe(true)
    expect(plan.nodeResults[0].command).toContain('pvcreate')
    expect(plan.nodeResults[0].command).toContain('-v')
    expect(plan.nodeResults[0].command).toContain('/dev/md0')
    expect(plan.confirmationPhrase).toBe('PVCREATE CLUSTER /dev/md0')
  })

  it('is not okSymmetric when preflight fails', async () => {
    vi.spyOn(preflightMod, 'runClusterLvmPreflight').mockResolvedValue({
      ...mockPreflight,
      ok: false,
      blockers: ['esos2: md0 absent'],
    } as any)
    const plan = await buildClusterPvCreatePlan('n1', 'cluster-1', {
      path: '/dev/md0',
      confirmation: '',
    })
    expect(plan.okSymmetric).toBe(false)
    expect(plan.blockers.length).toBeGreaterThan(0)
  })
})

describe('buildClusterVgCreatePlan', () => {
  beforeEach(() => {
    vi.spyOn(preflightMod, 'runClusterLvmPreflight').mockResolvedValue(mockPreflight as any)
    vi.spyOn(preflightMod, 'resolvePeerPvPaths').mockReturnValue(['/dev/md0'])
  })

  it('builds vgcreate -v per node', async () => {
    const plan = await buildClusterVgCreatePlan('n1', 'cluster-1', {
      name: 'data',
      pvPaths: ['/dev/md0'],
      confirmation: '',
    })
    expect(plan.confirmationPhrase).toBe('VGCREATE CLUSTER data')
    expect(plan.nodeResults[0].command).toContain('vgcreate -v data')
  })
})

describe('buildClusterLvCreatePlan', () => {
  beforeEach(() => {
    vi.spyOn(preflightMod, 'runClusterLvmPreflight').mockResolvedValue({
      ...mockPreflight,
      nodes: mockPreflight.nodes.map(n => ({
        ...n,
        overview: {
          ...n.overview,
          vgs: [{ name: 'data', uuid: 'a', sizeBytes: 1e12, freeBytes: 100e9, pvCount: 1, lvCount: 0, clustered: false }],
        },
      })),
    } as any)
  })

  it('builds lvcreate -v per node when VG has space', async () => {
    const plan = await buildClusterLvCreatePlan('n1', 'cluster-1', {
      vgName: 'data',
      name: 'lv0',
      sizeBytes: 10 * 1024 ** 3,
      confirmation: '',
    })
    expect(plan.okSymmetric).toBe(true)
    expect(plan.nodeResults[0].command).toContain('lvcreate')
    expect(plan.nodeResults[0].command).toContain('-v')
    expect(plan.confirmationPhrase).toBe('LVCREATE CLUSTER data/lv0')
  })
})
