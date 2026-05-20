import { describe, expect, it } from 'vitest'
import {
  buildAssembleRecoveryAssessment,
  buildClusterMdRecoveryAssessment,
  buildStopRecoveryAssessment,
  classifyMdArrayNodeState,
  computeClusterMdPlanToken,
  expectedClusterStopConfirmation,
  getActiveUuidConflict,
  SKIP_REASON,
  skipReasonForStopState,
} from '../server/utils/raid-cluster-md-node-state'
import type { ClusterStorageNodeInventory } from '../server/utils/raid-types'

const defaultTools = { mdadm: true, lspci: false, storcli: false, perccli: false, MegaCli64: false, arcconf: false, lsscsi: false, wipefs: false, parted: false, sfdisk: false, fdisk: false, partprobe: false, udevadm: false }

function node(partial: Partial<ClusterStorageNodeInventory> & { sanId: string; label: string }): ClusterStorageNodeInventory {
  return {
    role: null,
    readOnly: false,
    sshReady: true,
    tools: defaultTools,
    blockDevices: [],
    mdArrays: [],
    stoppedMdArrays: [],
    ...partial,
  }
}

const activeMd0 = {
  name: 'md0',
  path: '/dev/md0',
  uuid: 'uuid-a',
  state: 'active' as const,
  raidLevel: '1' as const,
  raidDevices: 2,
  activeDevices: 2,
  workingDevices: 2,
  failedDevices: 0,
  spareDevices: 0,
  usedBy: [] as const,
  warnings: [] as string[],
  members: [{ path: '/dev/sda1' }],
}

describe('classifyMdArrayNodeState', () => {
  it('classifies active array', () => {
    const report = classifyMdArrayNodeState(
      node({ sanId: 'san-1', label: 'esos1', mdArrays: [activeMd0 as any] }),
      'md0',
    )
    expect(report.state).toBe('active')
  })

  it('classifies missing when no signal', () => {
    const report = classifyMdArrayNodeState(node({ sanId: 'san-1', label: 'esos1' }), 'md0')
    expect(report.state).toBe('missing')
  })

  it('classifies unreachable when ssh down', () => {
    const report = classifyMdArrayNodeState(
      node({ sanId: 'san-1', label: 'esos1', sshReady: false, error: 'SSH non connecté' }),
      'md0',
    )
    expect(report.state).toBe('unreachable')
  })
})

describe('buildStopRecoveryAssessment', () => {
  it('allows stop_all_active when all nodes active', () => {
    const reports = [
      classifyMdArrayNodeState(node({ sanId: 'san-1', label: 'esos1', mdArrays: [activeMd0 as any] }), 'md0'),
      classifyMdArrayNodeState(node({ sanId: 'san-2', label: 'esos2', mdArrays: [{ ...activeMd0, members: [{ path: '/dev/sdb1' }] } as any] }), 'md0'),
    ]
    const assessment = buildStopRecoveryAssessment(reports, 'md0')
    expect(assessment.allowedRecoveryModes).toContain('stop_all_active')
    expect(assessment.recommendedRecoveryMode).toBe('stop_all_active')
  })

  it('allows stop_active_only when one missing one active', () => {
    const reports = [
      classifyMdArrayNodeState(node({ sanId: 'san-1', label: 'esos1' }), 'md0'),
      classifyMdArrayNodeState(node({ sanId: 'san-2', label: 'esos2', mdArrays: [activeMd0 as any] }), 'md0'),
    ]
    const assessment = buildStopRecoveryAssessment(reports, 'md0')
    expect(assessment.allowedRecoveryModes).toContain('stop_active_only')
    expect(assessment.allowedRecoveryModes).not.toContain('stop_all_active')
    expect(assessment.recommendedRecoveryMode).toBe('stop_active_only')
  })

  it('blocks when no active nodes', () => {
    const reports = [
      classifyMdArrayNodeState(node({ sanId: 'san-1', label: 'esos1' }), 'md0'),
      classifyMdArrayNodeState(node({ sanId: 'san-2', label: 'esos2' }), 'md0'),
    ]
    const assessment = buildStopRecoveryAssessment(reports, 'md0')
    expect(assessment.allowedRecoveryModes).toHaveLength(0)
    expect(assessment.hardBlockers.some(b => b.includes('actif'))).toBe(true)
  })

  it('allows stop_all_active on UUID mismatch in local_symmetric when structure matches', () => {
    const nodes = [
      node({ sanId: 'san-1', label: 'esos1', mdArrays: [{ ...activeMd0, uuid: 'uuid-a' } as any] }),
      node({ sanId: 'san-2', label: 'esos2', mdArrays: [{ ...activeMd0, uuid: 'uuid-b', members: [{ path: '/dev/sdb1' }] } as any] }),
    ]
    const reports = [
      classifyMdArrayNodeState(nodes[0], 'md0'),
      classifyMdArrayNodeState(nodes[1], 'md0'),
    ]
    const assessment = buildStopRecoveryAssessment(reports, 'md0', nodes)
    expect(assessment.hardBlockers.some(b => b.includes('UUID'))).toBe(false)
    expect(assessment.warnings.some(w => w.includes('ce ne sont pas le même tableau'))).toBe(false)
    expect(assessment.allowedRecoveryModes).toContain('stop_all_active')
    expect(assessment.allowedRecoveryModes).not.toContain('stop_inconsistent_active')
    expect(assessment.recommendedRecoveryMode).toBe('stop_all_active')
    expect(assessment.okSymmetric).toBe(true)
    expect(assessment.okDegraded).toBe(true)
    expect(assessment.uuidConflict).toBeUndefined()
    expect(getActiveUuidConflict(reports, 'md0').conflict).toBe(true)
  })

  it('allows stop_inconsistent_active on UUID conflict in shared_identity', () => {
    const nodes = [
      node({ sanId: 'san-1', label: 'esos1', mdArrays: [{ ...activeMd0, uuid: 'uuid-a' } as any] }),
      node({ sanId: 'san-2', label: 'esos2', mdArrays: [{ ...activeMd0, uuid: 'uuid-b', members: [{ path: '/dev/sdb1' }] } as any] }),
    ]
    const reports = [
      classifyMdArrayNodeState(nodes[0], 'md0'),
      classifyMdArrayNodeState(nodes[1], 'md0'),
    ]
    const assessment = buildStopRecoveryAssessment(reports, 'md0', nodes, 'shared_identity')
    expect(assessment.allowedRecoveryModes).toContain('stop_inconsistent_active')
    expect(assessment.allowedRecoveryModes).not.toContain('stop_all_active')
    expect(assessment.recommendedRecoveryMode).toBe('stop_inconsistent_active')
    expect(assessment.okSymmetric).toBe(false)
    expect(assessment.uuidConflict?.nodes).toHaveLength(2)
  })

  it('allows stop_active_only with unreachable peer when one active', () => {
    const reports = [
      classifyMdArrayNodeState(node({ sanId: 'san-1', label: 'esos1', sshReady: false }), 'md0'),
      classifyMdArrayNodeState(node({ sanId: 'san-2', label: 'esos2', mdArrays: [activeMd0 as any] }), 'md0'),
    ]
    const assessment = buildStopRecoveryAssessment(reports, 'md0')
    expect(assessment.allowedRecoveryModes).toContain('stop_active_only')
    expect(assessment.warnings.some(w => w.includes('inaccessible'))).toBe(true)
  })
})

describe('buildAssembleRecoveryAssessment', () => {
  it('allows assemble_missing_only when stopped on one active on other', () => {
    const stopped = {
      name: 'md0',
      path: '/dev/md0',
      uuid: 'uuid-a',
      stoppedState: 'assemblable' as const,
      detectedOn: 'scan' as const,
      raidDevices: 2,
      members: [{ path: '/dev/sda1', present: true, memberStatus: 'member_available' as const }],
      warnings: [],
    }
    const reports = [
      classifyMdArrayNodeState(node({ sanId: 'san-1', label: 'esos1', stoppedMdArrays: [stopped as any] }), 'md0'),
      classifyMdArrayNodeState(node({ sanId: 'san-2', label: 'esos2', mdArrays: [activeMd0 as any] }), 'md0'),
    ]
    const assessment = buildAssembleRecoveryAssessment(reports, 'md0')
    expect(assessment.allowedRecoveryModes).toContain('assemble_missing_only')
  })
})

describe('plan token and confirmation', () => {
  it('uses degraded stop confirmation phrase', () => {
    expect(expectedClusterStopConfirmation('md0', 'stop_active_only')).toBe('STOP md0 ON ACTIVE CLUSTER NODES')
    expect(expectedClusterStopConfirmation('md0', 'stop_all_active')).toBe('STOP md0')
    expect(expectedClusterStopConfirmation('md0', 'stop_inconsistent_active')).toBe('STOP INCONSISTENT md0')
  })

  it('changes plan token when recovery mode changes', () => {
    const reports = [
      classifyMdArrayNodeState(node({ sanId: 'san-1', label: 'esos1', mdArrays: [activeMd0 as any] }), 'md0'),
      classifyMdArrayNodeState(node({ sanId: 'san-2', label: 'esos2' }), 'md0'),
    ]
    const t1 = computeClusterMdPlanToken({
      action: 'stop_md',
      arrayName: 'md0',
      recoveryMode: 'stop_active_only',
      primarySanId: 'san-1',
      nodeReports: reports,
    })
    const t2 = computeClusterMdPlanToken({
      action: 'stop_md',
      arrayName: 'md0',
      recoveryMode: 'stop_all_active',
      primarySanId: 'san-1',
      nodeReports: reports,
    })
    expect(t1).not.toBe(t2)
  })

  it('changes plan token between inconsistent and active-only modes', () => {
    const reports = [
      classifyMdArrayNodeState(node({ sanId: 'san-1', label: 'esos1', mdArrays: [activeMd0 as any] }), 'md0'),
      classifyMdArrayNodeState(node({ sanId: 'san-2', label: 'esos2' }), 'md0'),
    ]
    const tInconsistent = computeClusterMdPlanToken({
      action: 'stop_md',
      arrayName: 'md0',
      recoveryMode: 'stop_inconsistent_active',
      primarySanId: 'san-1',
      nodeReports: reports,
    })
    const tActiveOnly = computeClusterMdPlanToken({
      action: 'stop_md',
      arrayName: 'md0',
      recoveryMode: 'stop_active_only',
      primarySanId: 'san-1',
      nodeReports: reports,
    })
    expect(tInconsistent).not.toBe(tActiveOnly)
  })
})

describe('skip reasons', () => {
  it('maps missing to not_active for stop', () => {
    expect(skipReasonForStopState('missing')).toBe(SKIP_REASON.not_active)
  })
})

describe('buildClusterMdRecoveryAssessment', () => {
  it('integrates stop assessment for cluster nodes', () => {
    const assessment = buildClusterMdRecoveryAssessment({
      action: 'stop_md',
      arrayName: 'md0',
      nodes: [
        node({ sanId: 'san-1', label: 'esos1' }),
        node({ sanId: 'san-2', label: 'esos2', mdArrays: [activeMd0 as any] }),
      ],
    })
    expect(assessment.nodeReports).toHaveLength(2)
    expect(assessment.allowedRecoveryModes).toContain('stop_active_only')
  })
})
