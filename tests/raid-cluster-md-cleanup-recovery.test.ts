import { describe, expect, it } from 'vitest'
import {
  buildCleanupNodeResults,
  buildCleanupRecoveryAssessment,
  CLEANUP_REACHABLE_CONFIRMATION,
  expectedClusterCleanupConfirmation,
  humanCleanupSkipReason,
} from '../server/utils/raid-cluster-md-cleanup-recovery'
import type {
  ClusterDiskMapping,
  ClusterStorageNodeInventory,
  ClusterStoragePreflightResult,
  RaidPreflightResult,
} from '../server/utils/raid-types'

const defaultTools = {
  mdadm: true,
  lspci: false,
  storcli: false,
  perccli: false,
  MegaCli64: false,
  arcconf: false,
  lsscsi: false,
  wipefs: true,
  parted: false,
  sfdisk: false,
  fdisk: false,
  partprobe: false,
  udevadm: false,
}

function node(partial: Partial<ClusterStorageNodeInventory> & { sanId: string, label: string }): ClusterStorageNodeInventory {
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

function okPreflight(): RaidPreflightResult {
  return { ok: true, blockers: [], warnings: [], requiredConfirmation: 'ZERO RAID METADATA' }
}

function preflight(partial: Partial<ClusterStoragePreflightResult>): ClusterStoragePreflightResult {
  return {
    ok: false,
    okSymmetric: false,
    okDegraded: false,
    action: 'zero_md_superblocks',
    sourceSanId: 'san-1',
    blockers: [],
    warnings: [],
    syncLimitations: [],
    nodes: [
      node({ sanId: 'san-1', label: 'esos1', role: 'primary' }),
      node({ sanId: 'san-2', label: 'esos2', role: 'secondary' }),
    ],
    mappings: [],
    perNodePreflights: {
      'san-1': okPreflight(),
      'san-2': okPreflight(),
    },
    executionModesAllowed: [],
    ...partial,
  }
}

describe('buildCleanupRecoveryAssessment', () => {
  it('includes all nodes when mapping complete on both', () => {
    const sourceMembers = ['/dev/sda1']
    const mappings: ClusterDiskMapping[] = [{
      sourcePath: '/dev/sda1',
      targetSanId: 'san-2',
      targetPath: '/dev/sdb1',
      confidence: 'high',
      evidence: [],
      warnings: [],
      blockers: [],
    }]
    const assessment = buildCleanupRecoveryAssessment({
      action: 'zero_md_superblocks',
      primarySanId: 'san-1',
      sourceMembers,
      nodes: preflight({ mappings }).nodes,
      mappings,
      perNodePreflights: { 'san-1': okPreflight(), 'san-2': okPreflight() },
    })
    expect(assessment.okSymmetric).toBe(true)
    expect(assessment.okDegraded).toBe(true)
    expect(assessment.allowedRecoveryModes).toHaveLength(0)
    expect(assessment.recommendedRecoveryMode).toBeNull()
    expect(expectedClusterCleanupConfirmation(null)).toBe('ZERO RAID METADATA')

    const results = buildCleanupNodeResults({
      preflight: preflight({ mappings, perNodePreflights: { 'san-1': okPreflight(), 'san-2': okPreflight() } }),
      primarySanId: 'san-1',
      sourceMembers,
      action: 'zero_md_superblocks',
      commandBuilder: m => m.map(p => `mdadm --zero-superblock ${p}`).join('\n'),
    })
    expect(results.every(r => r.participation === 'execute')).toBe(true)
  })

  it('skips peer with ambiguous mapping and allows cleanup_mapped_only', () => {
    const sourceMembers = ['/dev/sda1']
    const mappings: ClusterDiskMapping[] = [{
      sourcePath: '/dev/sda1',
      targetSanId: 'san-2',
      confidence: 'none',
      evidence: [],
      warnings: [],
      blockers: ['mapping ambigu'],
      candidates: [{ path: '/dev/sdb1', confidence: 'low', evidence: [], warnings: [] }],
    }]
    const assessment = buildCleanupRecoveryAssessment({
      action: 'zero_md_superblocks',
      primarySanId: 'san-1',
      sourceMembers,
      nodes: preflight({ mappings }).nodes,
      mappings,
      perNodePreflights: { 'san-1': okPreflight() },
    })
    expect(assessment.okSymmetric).toBe(false)
    expect(assessment.okDegraded).toBe(true)
    expect(assessment.allowedRecoveryModes).toContain('cleanup_mapped_only')
    expect(assessment.recommendedRecoveryMode).toBe('cleanup_mapped_only')
    expect(expectedClusterCleanupConfirmation('cleanup_mapped_only')).toBe(CLEANUP_REACHABLE_CONFIRMATION)

    const results = buildCleanupNodeResults({
      preflight: preflight({ mappings, perNodePreflights: { 'san-1': okPreflight() } }),
      primarySanId: 'san-1',
      sourceMembers,
      action: 'zero_md_superblocks',
      commandBuilder: m => m.map(p => `mdadm --zero-superblock ${p}`).join('\n'),
    })
    const primary = results.find(r => r.sanId === 'san-1')
    const peer = results.find(r => r.sanId === 'san-2')
    expect(primary?.participation).toBe('execute')
    expect(peer?.participation).toBe('skip')
    expect(peer?.skipReason).toContain(humanCleanupSkipReason('mapping_ambiguous'))
  })

  it('skips unreachable peer but keeps primary executable', () => {
    const sourceMembers = ['/dev/sda1']
    const nodes = [
      node({ sanId: 'san-1', label: 'esos1', role: 'primary' }),
      node({ sanId: 'san-2', label: 'esos2', role: 'secondary', sshReady: false, error: 'SSH non connecté' }),
    ]
    const assessment = buildCleanupRecoveryAssessment({
      action: 'zero_md_superblocks',
      primarySanId: 'san-1',
      sourceMembers,
      nodes,
      mappings: [],
      perNodePreflights: { 'san-1': okPreflight() },
    })
    expect(assessment.okDegraded).toBe(true)
    expect(assessment.recommendedRecoveryMode).toBe('cleanup_mapped_only')

    const results = buildCleanupNodeResults({
      preflight: preflight({ nodes, perNodePreflights: { 'san-1': okPreflight() } }),
      primarySanId: 'san-1',
      sourceMembers,
      action: 'zero_md_superblocks',
      commandBuilder: m => m.map(p => `mdadm --zero-superblock ${p}`).join('\n'),
    })
    expect(results.find(r => r.sanId === 'san-2')?.participation).toBe('skip')
    expect(results.find(r => r.sanId === 'san-1')?.participation).toBe('execute')
  })

  it('blocks when no node is executable', () => {
    const sourceMembers = ['/dev/sda1']
    const nodes = [
      node({ sanId: 'san-1', label: 'esos1', sshReady: false }),
      node({ sanId: 'san-2', label: 'esos2', sshReady: false }),
    ]
    const assessment = buildCleanupRecoveryAssessment({
      action: 'zero_md_superblocks',
      primarySanId: 'san-1',
      sourceMembers,
      nodes,
      mappings: [],
      perNodePreflights: {},
    })
    expect(assessment.okDegraded).toBe(false)
    expect(assessment.hardBlockers.some(b => b.includes('Aucun nœud'))).toBe(true)

    const results = buildCleanupNodeResults({
      preflight: preflight({ nodes, perNodePreflights: {} }),
      primarySanId: 'san-1',
      sourceMembers,
      action: 'zero_md_superblocks',
      commandBuilder: m => m.map(p => `mdadm --zero-superblock ${p}`).join('\n'),
    })
    expect(results.filter(r => r.participation === 'execute')).toHaveLength(0)
  })
})
