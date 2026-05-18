/**
 * Batch 2B.4 — cluster-scope helpers
 * Run: npx vitest run tests/cluster-scope.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  assertImplicitClusterCandidatesAllowed,
  distinctClusterIds,
  MULTI_CLUSTER_DISAMBIGUATION,
} from '../server/utils/cluster-scope'

function expectMultiCluster(fn: () => void) {
  try {
    fn()
    expect.fail('expected throw')
  } catch (e: unknown) {
    const err = e as { statusCode?: number; statusMessage?: string }
    expect(err.statusCode).toBe(400)
    expect(err.statusMessage).toBe(MULTI_CLUSTER_DISAMBIGUATION)
  }
}

describe('distinctClusterIds', () => {
  it('returns unique non-null ids', () => {
    expect(distinctClusterIds([{ clusterId: 'a' }, { clusterId: 'b' }, { clusterId: 'a' }])).toEqual(['a', 'b'])
  })
  it('filters null', () => {
    expect(distinctClusterIds([{ clusterId: null }, { clusterId: 'x' }])).toEqual(['x'])
  })
})

describe('assertImplicitClusterCandidatesAllowed', () => {
  it('allows empty', () => {
    expect(() => assertImplicitClusterCandidatesAllowed([])).not.toThrow()
  })
  it('allows single row with null clusterId', () => {
    expect(() => assertImplicitClusterCandidatesAllowed([{ clusterId: null }])).not.toThrow()
  })
  it('allows multiple rows same cluster', () => {
    expect(() =>
      assertImplicitClusterCandidatesAllowed([
        { clusterId: 'c1' },
        { clusterId: 'c1' },
      ]),
    ).not.toThrow()
  })
  it('throws when multiple distinct cluster ids', () => {
    expectMultiCluster(() =>
      assertImplicitClusterCandidatesAllowed([
        { clusterId: 'c1' },
        { clusterId: 'c2' },
      ]),
    )
  })
  it('throws when multiple rows all null clusterId', () => {
    expectMultiCluster(() =>
      assertImplicitClusterCandidatesAllowed([
        { clusterId: null },
        { clusterId: null },
      ]),
    )
  })
})
