import { describe, expect, it } from 'vitest'
import { buildClusterPvConfirmChecks, clusterPvConfirmBlocked } from '../utils/lvm-cluster-pv-confirm'
import type { ClusterLvmExecutionPlan } from '~/types/lvm'

const labels = { force_acknowledged: 'force ok' }

describe('buildClusterPvConfirmChecks', () => {
  it('flags not_already_pv when blockers mention existing PV', () => {
    const checks = buildClusterPvConfirmChecks({
      primarySanId: 'n1',
      sourcePath: '/dev/md0',
      force: false,
      mappings: [],
      preflight: {
        ok: false,
        blockers: ['esos2 : PV déjà présent sur /dev/md0'],
        warnings: [],
        mappings: [],
        symmetryIssues: [],
        nodes: [],
      },
      plan: null,
      labels,
    })
    const pvCheck = checks.find(c => c.id === 'not_already_pv')
    expect(pvCheck?.ok).toBe(false)
    expect(pvCheck?.detail).toContain('esos2')
  })

  it('clusterPvConfirmBlocked when checks fail', () => {
    const plan = { okSymmetric: true } as ClusterLvmExecutionPlan
    expect(clusterPvConfirmBlocked([{ id: 'x', ok: false }], plan)).toBe(true)
    expect(clusterPvConfirmBlocked([{ id: 'x', ok: true }], { ...plan, okSymmetric: false })).toBe(true)
  })
})
