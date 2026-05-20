import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  assertClusteredSanAllowsLvmMutation,
  CLUSTER_LVM_BLOCKED_MESSAGE,
} from '../server/utils/lvm-cluster-execution'

vi.mock('../server/db/repositories/san.repository', () => ({
  getSanSummary: vi.fn(),
}))

import { getSanSummary } from '../server/db/repositories/san.repository'

describe('assertClusteredSanAllowsLvmMutation', () => {
  beforeEach(() => {
    vi.mocked(getSanSummary).mockReset()
  })

  it('returns null for non-clustered SAN', () => {
    vi.mocked(getSanSummary).mockReturnValue({ clusterId: null } as any)
    expect(assertClusteredSanAllowsLvmMutation('san1')).toBeNull()
  })

  it('throws 409 without clusterExecution on clustered SAN', () => {
    vi.mocked(getSanSummary).mockReturnValue({ clusterId: 'c1' } as any)
    expect(() => assertClusteredSanAllowsLvmMutation('san1')).toThrow()
    try {
      assertClusteredSanAllowsLvmMutation('san1')
    } catch (e: any) {
      expect(e.statusCode).toBe(409)
      expect(e.statusMessage).toBe(CLUSTER_LVM_BLOCKED_MESSAGE)
    }
  })

  it('returns clusterId when clusterExecution present', () => {
    vi.mocked(getSanSummary).mockReturnValue({ clusterId: 'c1' } as any)
    expect(assertClusteredSanAllowsLvmMutation('san1', { primarySanId: 'san1' })).toEqual({ clusterId: 'c1' })
  })
})

describe('cluster plan symmetry', () => {
  it('requires all nodes execute for okSymmetric plan', () => {
    const plan = {
      action: 'pvcreate' as const,
      primarySanId: 'n1',
      confirmationPhrase: 'PVCREATE CLUSTER /dev/md0',
      nodeResults: [
        { sanId: 'n1', label: 'N1', participation: 'execute' as const, command: 'pvcreate' },
        { sanId: 'n2', label: 'N2', participation: 'skip' as const, error: 'Mapping manquant' },
      ],
      okSymmetric: false,
      warnings: [],
      blockers: ['N2: Mapping manquant'],
    }
    expect(plan.okSymmetric).toBe(false)
    expect(plan.nodeResults.every(n => n.participation === 'execute')).toBe(false)
  })
})
