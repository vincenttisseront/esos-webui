import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SAN_READONLY_CODE, assertSanWritable } from '../server/utils/san-request-context'

vi.mock('../server/db/repositories/san.repository', () => ({
  getSanSummary: vi.fn(),
}))

import { getSanSummary } from '../server/db/repositories/san.repository'

describe('assertSanWritable', () => {
  beforeEach(() => {
    vi.mocked(getSanSummary).mockReset()
  })

  it('allows writable SAN', () => {
    vi.mocked(getSanSummary).mockReturnValue({ id: 's1', readOnly: false } as any)
    expect(() => assertSanWritable('s1')).not.toThrow()
  })

  it('throws 403 with san.read_only code', () => {
    vi.mocked(getSanSummary).mockReturnValue({ id: 's1', readOnly: true } as any)
    try {
      assertSanWritable('s1')
      expect.fail('expected throw')
    } catch (err: any) {
      expect(err.statusCode).toBe(403)
      expect(err.data?.code).toBe(SAN_READONLY_CODE)
    }
  })
})
