import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SAN_READONLY_CODE } from '../server/utils/san-request-context'

vi.mock('../server/db', () => ({
  getDB: vi.fn(),
}))

vi.mock('../server/utils/cluster-readonly', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/cluster-readonly')>()
  return actual
})

import { getDB } from '../server/db'
import { assertClusterNodesWritable } from '../server/utils/cluster-readonly'

describe('assertClusterNodesWritable', () => {
  beforeEach(() => {
    vi.mocked(getDB).mockReset()
  })

  it('throws 403 when any cluster node is read-only', () => {
    const all = vi.fn().mockReturnValue([
      { id: 'n1', label: 'Node 1', readOnly: false },
      { id: 'n2', label: 'Node 2', readOnly: true },
    ])
    vi.mocked(getDB).mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({ all }),
        }),
      }),
    } as any)

    try {
      assertClusterNodesWritable('cluster-1')
      expect.fail('expected throw')
    } catch (err: any) {
      expect(err.statusCode).toBe(403)
      expect(err.data?.code).toBe(SAN_READONLY_CODE)
      expect(err.data?.nodes).toHaveLength(1)
    }
  })
})
