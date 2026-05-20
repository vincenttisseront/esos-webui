import { describe, expect, it } from 'vitest'
import {
  buildPeerLocalRecoveryPayload,
  expectedPeerCleanupConfirmation,
  groupPeerSuperblockBlockers,
  resolvePeerCleanupMembers,
} from '../utils/create-md-peer-cleanup'
import type { ClusterStoragePreflightResult } from '../types/raid'

function preflight(partial: Partial<ClusterStoragePreflightResult>): ClusterStoragePreflightResult {
  return {
    ok: false,
    action: 'create_md',
    sourceSanId: 'san-1',
    blockers: [],
    warnings: [],
    syncLimitations: [],
    nodes: [
      { sanId: 'san-1', label: 'esos1', role: 'primary', readOnly: false, sshReady: true, blockDevices: [], mdArrays: [], stoppedMdArrays: [] },
      { sanId: 'san-2', label: 'esos2', role: 'secondary', readOnly: false, sshReady: true, blockDevices: [], mdArrays: [], stoppedMdArrays: [] },
    ],
    mappings: [{
      sourcePath: '/dev/sda1',
      targetSanId: 'san-2',
      targetPath: '/dev/sdb1',
      confidence: 'high',
      evidence: [],
      warnings: [],
      blockers: [],
    }],
    perNodePreflights: {},
    executionModesAllowed: [],
    blockerRefs: [],
    ...partial,
  }
}

describe('groupPeerSuperblockBlockers', () => {
  it('groups peer superblock refs excluding primary', () => {
    const pf = preflight({
      blockerRefs: [
        { code: 'md_superblock_on_partition', path: '/dev/sda1', sanId: 'san-1', message: 'esos1 : /dev/sda1', uiAnchor: 'devices' },
        { code: 'md_superblock_on_partition', path: '/dev/sdb1', sanId: 'san-2', message: 'esos2 : /dev/sdb1', uiAnchor: 'devices' },
        { code: 'md_superblock_on_partition', path: '/dev/sdc1', sanId: 'san-2', message: 'esos2 : /dev/sdc1', uiAnchor: 'devices' },
      ],
    })
    const groups = groupPeerSuperblockBlockers(pf, 'san-1', ['/dev/sda1'])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('esos2')
    expect(groups[0].sanId).toBe('san-2')
    expect(groups[0].members).toEqual(['/dev/sdb1', '/dev/sdc1'])
    expect(groups[0].blockerRefs).toHaveLength(2)
  })

  it('returns empty when no peer superblock refs', () => {
    expect(groupPeerSuperblockBlockers(preflight({}), 'san-1')).toEqual([])
  })
})

describe('resolvePeerCleanupMembers', () => {
  it('prefers blocker ref paths over mapping fallback', () => {
    const pf = preflight({
      blockerRefs: [
        { code: 'md_superblock_on_partition', path: '/dev/sdb1', sanId: 'san-2', message: 'x', uiAnchor: 'devices' },
      ],
    })
    expect(resolvePeerCleanupMembers({ preflight: pf, peerSanId: 'san-2', sourceDevices: ['/dev/sda1'] }))
      .toEqual(['/dev/sdb1'])
  })

  it('falls back to cluster mappings when refs missing paths', () => {
    const pf = preflight({ blockerRefs: [] })
    expect(resolvePeerCleanupMembers({ preflight: pf, peerSanId: 'san-2', sourceDevices: ['/dev/sda1'] }))
      .toEqual(['/dev/sdb1'])
  })
})

describe('buildPeerLocalRecoveryPayload', () => {
  it('builds local recovery payload for peer create unblock', () => {
    const payload = buildPeerLocalRecoveryPayload({
      peerSanId: 'san-2',
      members: ['/dev/sdb1', '/dev/sdc1'],
      confirmation: 'CLEAN LOCAL NODE esos2',
    })
    expect(payload.members).toEqual(['/dev/sdb1', '/dev/sdc1'])
    expect(payload.localRecovery).toEqual({
      scope: 'local',
      sanId: 'san-2',
      members: ['/dev/sdb1', '/dev/sdc1'],
      confirmation: 'CLEAN LOCAL NODE esos2',
      reason: 'peer_superblock_blocks_create',
    })
  })

  it('uses CLEAN LOCAL NODE confirmation phrase', () => {
    expect(expectedPeerCleanupConfirmation('esos2')).toBe('CLEAN LOCAL NODE esos2')
  })
})
