import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  CLUSTER_MD_BLOCKED_MESSAGE,
  assertClusteredSanAllowsMutation,
  buildStopMdClusterExecutionPlan,
} from '../server/utils/raid-cluster-md-execution'
import * as clusterPreflight from '../server/utils/raid-cluster-storage-preflight'

vi.mock('../server/db/repositories/san.repository', () => ({
  getSanSummary: vi.fn(),
}))

import { getSanSummary } from '../server/db/repositories/san.repository'

describe('assertClusteredSanAllowsMutation', () => {
  beforeEach(() => {
    vi.mocked(getSanSummary).mockReset()
  })

  it('returns null for standalone SAN', () => {
    vi.mocked(getSanSummary).mockReturnValue({ id: 'san-1', clusterId: null } as any)
    expect(assertClusteredSanAllowsMutation('san-1', undefined)).toBeNull()
  })

  it('throws 409 when clustered without clusterExecution', () => {
    vi.mocked(getSanSummary).mockReturnValue({ id: 'san-1', clusterId: 'cluster-1' } as any)
    expect(() => assertClusteredSanAllowsMutation('san-1', undefined)).toThrowError(
      expect.objectContaining({ statusMessage: CLUSTER_MD_BLOCKED_MESSAGE }),
    )
  })

  it('accepts valid clusterExecution', () => {
    vi.mocked(getSanSummary).mockReturnValue({ id: 'san-1', clusterId: 'cluster-1', label: 'esos1' } as any)
    const ctx = assertClusteredSanAllowsMutation('san-1', {
      primarySanId: 'san-1',
      requirePreflightOk: true,
      clusterId: 'cluster-1',
    })
    expect(ctx?.clusterId).toBe('cluster-1')
  })
})

describe('buildStopMdClusterExecutionPlan', () => {
  it('builds per-node stop commands when cluster preflight ok', async () => {
    const md0 = { name: 'md0', path: '/dev/md0', uuid: 'u1', members: [{ path: '/dev/sda' }], state: 'active', raidLevel: '1', raidDevices: 2, activeDevices: 2, workingDevices: 2, failedDevices: 0, spareDevices: 0, usedBy: [], warnings: [] }
    const nodes = [
      {
        sanId: 'san-1',
        label: 'esos1',
        role: 'primary',
        readOnly: false,
        sshReady: true,
        blockDevices: [],
        mdArrays: [md0],
        stoppedMdArrays: [],
      },
      {
        sanId: 'san-2',
        label: 'esos2',
        role: 'secondary',
        readOnly: false,
        sshReady: true,
        blockDevices: [],
        mdArrays: [{ ...md0, members: [{ path: '/dev/sdb' }] }],
        stoppedMdArrays: [],
      },
    ]
    vi.spyOn(clusterPreflight, 'runClusterStoragePreflight').mockResolvedValue({
      ok: true,
      okSymmetric: true,
      okDegraded: true,
      action: 'stop_md',
      sourceSanId: 'san-1',
      blockers: [],
      warnings: [],
      syncLimitations: [],
      mappings: [],
      perNodePreflights: {
        'san-1': { ok: true, blockers: [], warnings: [], riskLevel: 'destructive', requiredConfirmation: 'STOP md0', impactedDevices: ['/dev/md0'], detectedUsage: {} },
        'san-2': { ok: true, blockers: [], warnings: [], riskLevel: 'destructive', requiredConfirmation: 'STOP md0', impactedDevices: ['/dev/md0'], detectedUsage: {} },
      },
      executionModesAllowed: ['all_nodes'],
      nodes,
      recoveryAssessment: {
        action: 'stop_md',
        arrayName: 'md0',
        nodeReports: nodes.map(n => ({
          sanId: n.sanId,
          label: n.label,
          role: n.role,
          sshReady: true,
          state: 'active' as const,
          arrayPath: '/dev/md0',
          members: n.mdArrays[0].members.map((m: { path: string }) => m.path),
          uuid: 'u1',
          reasons: [],
          nodeBlockers: [],
          nodeWarnings: [],
        })),
        hardBlockers: [],
        warnings: [],
        allowedRecoveryModes: ['stop_all_active'],
        recommendedRecoveryMode: 'stop_all_active',
        okSymmetric: true,
        okDegraded: true,
      },
    } as any)

    const plan = await buildStopMdClusterExecutionPlan({
      primarySanId: 'san-1',
      arrayName: 'md0',
    })

    expect(plan.nodeResults).toHaveLength(2)
    expect(plan.nodeResults.filter(n => n.participation === 'execute')).toHaveLength(2)
    expect(plan.nodeResults.every(n => n.command === 'mdadm --stop /dev/md0')).toBe(true)
    expect(plan.nodeResults[0].source).toBe('primary')
    expect(plan.nodeResults[1].source).toBe('peer')
    expect(plan.recoveryMode).toBe('stop_all_active')
  })
})
