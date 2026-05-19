import { describe, expect, it } from 'vitest'
import {
  assertLocalRecoveryConfirmation,
  assertMutualExclusiveClusterAndLocal,
  buildLocalRecoveryOffered,
  expectedLocalCleanupConfirmation,
  isMappingAmbiguityClusterBlock,
} from '../server/utils/raid-local-recovery'
import type { ClusterStoragePreflightResult } from '../server/utils/raid-types'

function preflight(partial: Partial<ClusterStoragePreflightResult>): ClusterStoragePreflightResult {
  return {
    ok: false,
    action: 'zero_md_superblocks',
    sourceSanId: 'san-1',
    blockers: [],
    warnings: [],
    syncLimitations: [],
    nodes: [
      {
        sanId: 'san-1',
        label: 'esos1',
        role: 'primary',
        readOnly: false,
        sshReady: true,
        blockDevices: [],
        mdArrays: [],
        stoppedMdArrays: [],
      },
      {
        sanId: 'san-2',
        label: 'esos2',
        role: 'secondary',
        readOnly: false,
        sshReady: true,
        blockDevices: [],
        mdArrays: [],
        stoppedMdArrays: [],
      },
    ],
    mappings: [],
    perNodePreflights: {},
    executionModesAllowed: [],
    ...partial,
  }
}

describe('isMappingAmbiguityClusterBlock', () => {
  it('returns true when only mapping ambigu blockers', () => {
    const pf = preflight({
      blockers: ['esos2 : mapping ambigu pour /dev/sda1 (2 candidats)'],
      mappings: [{
        sourcePath: '/dev/sda1',
        targetSanId: 'san-2',
        confidence: 'none',
        evidence: [],
        warnings: [],
        blockers: ['mapping ambigu pour /dev/sda1 (2 candidats)'],
        candidates: [{ path: '/dev/sdb1', confidence: 'low', evidence: [], warnings: [] }],
      }],
    })
    expect(isMappingAmbiguityClusterBlock(pf)).toBe(true)
    expect(buildLocalRecoveryOffered(pf)?.allowed).toBe(true)
  })

  it('returns false when hard non-mapping blocker present', () => {
    const pf = preflight({
      blockers: ['esos2 : mapping ambigu pour /dev/sda1', 'esos1 : /dev/md0 est monté'],
    })
    expect(isMappingAmbiguityClusterBlock(pf)).toBe(false)
    expect(buildLocalRecoveryOffered(pf)).toBeUndefined()
  })

  it('returns false when cluster preflight ok', () => {
    expect(isMappingAmbiguityClusterBlock(preflight({ ok: true }))).toBe(false)
  })
})

describe('local recovery confirmation', () => {
  it('expects CLEAN LOCAL NODE with label', () => {
    expect(expectedLocalCleanupConfirmation('esos1')).toBe('CLEAN LOCAL NODE esos1')
  })

  it('rejects wrong confirmation', () => {
    expect(() => assertLocalRecoveryConfirmation(
      { scope: 'local', sanId: 'san-1', members: ['/dev/sda1'], confirmation: 'wrong' },
      'CLEAN LOCAL NODE esos1',
    )).toThrow()
  })

  it('accepts matching confirmation', () => {
    expect(() => assertLocalRecoveryConfirmation(
      { scope: 'local', sanId: 'san-1', members: ['/dev/sda1'], confirmation: 'CLEAN LOCAL NODE esos1' },
      'CLEAN LOCAL NODE esos1',
    )).not.toThrow()
  })
})

describe('mutual exclusion', () => {
  it('rejects clusterExecution and localRecovery together', () => {
    expect(() => assertMutualExclusiveClusterAndLocal(
      { primarySanId: 'san-1', requirePreflightOk: true },
      { scope: 'local', sanId: 'san-1', members: ['/dev/sda1'], confirmation: 'CLEAN LOCAL NODE esos1' },
    )).toThrow()
  })
})

describe('buildLocalRecoveryOffered', () => {
  it('lists skipped peers with reasons', () => {
    const offered = buildLocalRecoveryOffered(preflight({
      blockers: ['esos2 : mapping incomplet (0/1 chemins)'],
      mappings: [],
    }))
    expect(offered?.skippedPeers).toHaveLength(1)
    expect(offered?.skippedPeers[0].label).toBe('esos2')
  })
})
