import { describe, expect, it } from 'vitest'
import { buildClusterMdRecoveryAssessment } from '../server/utils/raid-cluster-md-node-state'
import {
  assessMdLvmClusterSymmetry,
  collectMdArrayLvmStates,
  filterMdClusterAsymmetryHardBlockers,
} from '../utils/md-lvm-cluster-symmetry'
import { filterMdHealthWarnings } from '../utils/cluster-md-symmetry'

/** Mirrors cluster-storage-consistency per-array health (without SSH). */
function evaluateArrayStorageHealth(
  assessment: ReturnType<typeof buildClusterMdRecoveryAssessment>,
  lvmInventories: Parameters<typeof collectMdArrayLvmStates>[0],
  arrayName: string,
): { overall: 'ok' | 'warning' | 'critical'; okSymmetric: boolean } {
  const mdLvmStates = collectMdArrayLvmStates(lvmInventories, arrayName)
  const mdLvmIssues = assessMdLvmClusterSymmetry(mdLvmStates)
  const healthBlockers = filterMdClusterAsymmetryHardBlockers(assessment.hardBlockers, mdLvmIssues)
  const healthWarnings = filterMdHealthWarnings(assessment.warnings)
  const structurallySymmetric = assessment.structurallySymmetric
  let overall: 'ok' | 'warning' | 'critical' = 'ok'
  const hasCriticalLvmAsymmetry = mdLvmIssues.some(i => i.severity === 'critical')
  if (healthBlockers.length || hasCriticalLvmAsymmetry) overall = 'critical'
  else if (!structurallySymmetric) overall = 'warning'
  else if (healthWarnings.length) overall = 'warning'
  return { overall, okSymmetric: structurallySymmetric }
}

const activeMd0 = {
  name: 'md0',
  path: '/dev/md0',
  state: 'clean' as const,
  raidLevel: '1',
  raidDevices: 2,
  activeDevices: 2,
  workingDevices: 2,
  failedDevices: 0,
  spareDevices: 0,
  members: [{ path: '/dev/sda1' }, { path: '/dev/sda2' }],
  usedBy: [] as string[],
  warnings: [],
}

function node(overrides: {
  sanId: string
  label: string
  mdArrays?: typeof activeMd0[]
  role?: string
}) {
  return {
    sanId: overrides.sanId,
    label: overrides.label,
    role: overrides.role ?? 'primary',
    sshReady: true,
    tools: true,
    mdArrays: overrides.mdArrays ?? [],
    stoppedMdArrays: [],
    blockDevices: [],
    error: undefined,
  }
}

describe('cluster MD storage health (local_symmetric)', () => {
  const lvmOnMd0 = (sanId: string, label: string, uuid: string) =>
    node({
      sanId,
      label,
      mdArrays: [{ ...activeMd0, uuid, usedBy: ['lvm'] } as typeof activeMd0],
    })

  it('same md0 clean different UUID with symmetric LVM => ok', () => {
    const inventories = [
      lvmOnMd0('san-1', 'esos1', 'uuid-a'),
      lvmOnMd0('san-2', 'esos2', 'uuid-b'),
    ]
    const assessment = buildClusterMdRecoveryAssessment({
      action: 'stop_md',
      arrayName: 'md0',
      nodes: inventories as any,
    })
    const lvmInv = inventories.map(n => ({
      sanId: n.sanId,
      label: n.label,
      mdArrays: n.mdArrays,
      pvs: [{ path: '/dev/md0', vgName: 'vg0' }],
    }))
    const health = evaluateArrayStorageHealth(assessment, lvmInv, 'md0')
    expect(assessment.structurallySymmetric).toBe(true)
    expect(health.okSymmetric).toBe(true)
    expect(health.overall).toBe('ok')
  })

  it('different RAID level => warning', () => {
    const inventories = [
      node({ sanId: 'san-1', label: 'esos1', mdArrays: [{ ...activeMd0, uuid: 'a' }] }),
      node({
        sanId: 'san-2',
        label: 'esos2',
        mdArrays: [{ ...activeMd0, uuid: 'b', raidLevel: '5' }],
      }),
    ]
    const assessment = buildClusterMdRecoveryAssessment({
      action: 'stop_md',
      arrayName: 'md0',
      nodes: inventories as any,
    })
    const health = evaluateArrayStorageHealth(assessment, inventories.map(n => ({
      sanId: n.sanId,
      label: n.label,
      mdArrays: n.mdArrays,
      pvs: [],
    })), 'md0')
    expect(assessment.structurallySymmetric).toBe(false)
    expect(health.overall).toBe('warning')
  })

  it('peer missing md0 => warning', () => {
    const inventories = [
      node({ sanId: 'san-1', label: 'esos1', mdArrays: [{ ...activeMd0, uuid: 'a' }] }),
      node({ sanId: 'san-2', label: 'esos2', mdArrays: [] }),
    ]
    const assessment = buildClusterMdRecoveryAssessment({
      action: 'stop_md',
      arrayName: 'md0',
      nodes: inventories as any,
    })
    const health = evaluateArrayStorageHealth(assessment, inventories.map(n => ({
      sanId: n.sanId,
      label: n.label,
      mdArrays: n.mdArrays,
      pvs: [],
    })), 'md0')
    expect(assessment.structurallySymmetric).toBe(false)
    expect(health.overall).toBe('warning')
  })
})

describe('shared_identity storage health', () => {
  it('UUID mismatch is not structurally symmetric and warns in shared_identity', () => {
    const inventories = [
      node({ sanId: 'san-1', label: 'esos1', mdArrays: [{ ...activeMd0, uuid: 'uuid-a' }] }),
      node({ sanId: 'san-2', label: 'esos2', mdArrays: [{ ...activeMd0, uuid: 'uuid-b' }] }),
    ]
    const assessment = buildClusterMdRecoveryAssessment({
      action: 'stop_md',
      arrayName: 'md0',
      nodes: inventories as any,
      storageMode: 'shared_identity',
    })
    const health = evaluateArrayStorageHealth(assessment, inventories.map(n => ({
      sanId: n.sanId,
      label: n.label,
      mdArrays: n.mdArrays,
      pvs: [],
    })), 'md0')
    expect(assessment.structurallySymmetric).toBe(false)
    expect(assessment.warnings.some(w => w.includes('UUID MD différents'))).toBe(true)
    expect(filterMdHealthWarnings(assessment.warnings, 'shared_identity')).toEqual(assessment.warnings)
    expect(health.overall).toBe('warning')
  })
})

describe('filterMdHealthWarnings', () => {
  it('strips UUID mismatch warnings in local_symmetric', () => {
    const warnings = [
      'UUID MD différents entre nœuds actifs pour md0 : a, b — ce ne sont pas le même tableau',
      'md0 : niveau RAID différent (1 vs 5 sur esos2)',
    ]
    expect(filterMdHealthWarnings(warnings)).toEqual([
      'md0 : niveau RAID différent (1 vs 5 sur esos2)',
    ])
  })
})
