import { describe, it, expect } from 'vitest'
import { assertScstClusterSuccess } from '../server/utils/scst-cluster-mutation'
import type { ScstClusterMutationResult } from '../server/utils/scst-cluster-mutation'

describe('assertScstClusterSuccess', () => {
  it('does not throw when success', () => {
    const ok: ScstClusterMutationResult = {
      success: true,
      nodeResults: [],
      errors: [],
      refreshedSanIds: [],
    }
    expect(() => assertScstClusterSuccess(ok)).not.toThrow()
  })

  it('throws 409 when partial execute', () => {
    const partial: ScstClusterMutationResult = {
      success: false,
      nodeResults: [
        { sanId: 'a', label: 'A', participation: 'execute' },
        { sanId: 'b', label: 'B', participation: 'failed', error: 'fail' },
      ],
      errors: ['B: fail'],
      refreshedSanIds: ['a'],
    }
    try {
      assertScstClusterSuccess(partial)
      expect.fail('expected throw')
    } catch (err: unknown) {
      const e = err as { statusCode?: number; data?: { nodeResults?: unknown[] } }
      expect(e.statusCode).toBe(409)
      expect(e.data?.nodeResults?.length).toBe(2)
    }
  })
})
