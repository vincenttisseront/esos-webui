import { describe, expect, it } from 'vitest'
import {
  assessClusterArraySymmetry,
  findClusterUuidMismatches,
  findLocalSymmetricStructuralIssues,
  getActiveUuidConflict,
  resolveClusterMdStorageMode,
  type ActiveMdArraySnapshot,
} from '../utils/cluster-md-symmetry'

function md0(overrides: Partial<ActiveMdArraySnapshot> = {}): ActiveMdArraySnapshot {
  return {
    name: 'md0',
    path: '/dev/md0',
    uuid: 'uuid-a',
    state: 'clean',
    raidLevel: '1',
    raidDevices: 2,
    activeDevices: 2,
    failedDevices: 0,
    sizeBytes: 1_000_000_000,
    memberCount: 2,
    ...overrides,
  }
}

describe('resolveClusterMdStorageMode', () => {
  it('defaults to local_symmetric', () => {
    expect(resolveClusterMdStorageMode()).toBe('local_symmetric')
  })
})

describe('local_symmetric symmetry', () => {
  const peerInput = (peer: ActiveMdArraySnapshot) => [{
    nodeSanId: 'san-b',
    nodeLabel: 'esos2',
    activeMdArrays: [peer],
  }]

  it('same md0 with different UUID is structurally symmetric', () => {
    const results = findLocalSymmetricStructuralIssues({
      currentSanId: 'san-a',
      currentLabel: 'esos1',
      localArrays: [md0({ uuid: 'aaa' })],
      peerSnapshots: peerInput(md0({ uuid: 'bbb' })),
    })
    const md0Result = results.find(r => r.arrayName === 'md0')
    expect(md0Result?.structurallySymmetric).toBe(true)
    expect(md0Result?.structuralIssues).toHaveLength(0)
    expect(md0Result?.uuidMismatch).toBeDefined()
    expect(findClusterUuidMismatches({
      currentSanId: 'san-a',
      currentLabel: 'esos1',
      localArrays: [md0({ uuid: 'aaa' })],
      peerSnapshots: peerInput(md0({ uuid: 'bbb' })),
    })).toHaveLength(0)
  })

  it('different RAID level yields structural warning', () => {
    const results = assessClusterArraySymmetry({
      currentSanId: 'san-a',
      currentLabel: 'esos1',
      localArrays: [md0({ raidLevel: '1' })],
      peerSnapshots: peerInput(md0({ raidLevel: '5', uuid: 'bbb' })),
    })
    const md0Result = results.find(r => r.arrayName === 'md0')
    expect(md0Result?.structurallySymmetric).toBe(false)
    expect(md0Result?.structuralIssues.some(i => i.kind === 'raid_level')).toBe(true)
  })

  it('different activeDevices yields structural warning', () => {
    const results = assessClusterArraySymmetry({
      currentSanId: 'san-a',
      currentLabel: 'esos1',
      localArrays: [md0({ activeDevices: 2 })],
      peerSnapshots: peerInput(md0({ activeDevices: 1, uuid: 'bbb' })),
    })
    expect(results.find(r => r.arrayName === 'md0')?.structuralIssues.some(i => i.kind === 'active_devices')).toBe(true)
  })

  it('md0 active locally but missing on peer is critical', () => {
    const results = findLocalSymmetricStructuralIssues({
      currentSanId: 'san-a',
      currentLabel: 'esos1',
      localArrays: [md0()],
      peerSnapshots: [{ nodeSanId: 'san-b', nodeLabel: 'esos2', activeMdArrays: [] }],
    })
    expect(results.find(r => r.arrayName === 'md0')?.structuralIssues.some(i => i.kind === 'missing_on_peer')).toBe(true)
  })
})

describe('shared_identity symmetry', () => {
  it('different UUID is reported as mismatch', () => {
    const mismatches = findClusterUuidMismatches({
      currentSanId: 'san-a',
      currentLabel: 'esos1',
      localArrays: [md0({ uuid: 'aaa' })],
      peerSnapshots: [{
        nodeSanId: 'san-b',
        nodeLabel: 'esos2',
        activeMdArrays: [md0({ uuid: 'bbb' })],
      }],
      mode: 'shared_identity',
    })
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]?.arrayName).toBe('md0')
    const assessment = assessClusterArraySymmetry({
      currentSanId: 'san-a',
      currentLabel: 'esos1',
      localArrays: [md0({ uuid: 'aaa' })],
      peerSnapshots: [{
        nodeSanId: 'san-b',
        nodeLabel: 'esos2',
        activeMdArrays: [md0({ uuid: 'bbb' })],
      }],
      mode: 'shared_identity',
    })
    expect(assessment.find(r => r.arrayName === 'md0')?.structurallySymmetric).toBe(false)
  })
})

describe('getActiveUuidConflict', () => {
  it('detects conflict when multiple UUIDs on active nodes', () => {
    const conflict = getActiveUuidConflict([
      { sanId: 'san-a', label: 'esos1', state: 'active', uuid: 'a' },
      { sanId: 'san-b', label: 'esos2', state: 'active', uuid: 'b' },
    ], 'md0')
    expect(conflict.conflict).toBe(true)
    expect(conflict.uniqueUuids).toHaveLength(2)
  })
})
