/**
 * Batch 2B.2 — resolveScopedSanIdForRead / runReadWithSanScope
 * Run: npx vitest run tests/san-request-context.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEvent } from 'h3'

vi.mock('../server/db/repositories/san.repository', () => ({
  getAllSans: vi.fn(),
}))

import { getAllSans } from '../server/db/repositories/san.repository'
import {
  parseOptionalSanIdQuery,
  resolveScopedSanIdForRead,
  runReadWithSanScope,
} from '../server/utils/san-request-context'

function eventWithQuery(sanId?: string) {
  const q = sanId === undefined ? '' : `sanId=${encodeURIComponent(sanId)}`
  const suffix = q ? `?${q}` : ''
  return createEvent({ method: 'GET', url: `http://localhost/api/x${suffix}` })
}

beforeEach(() => {
  vi.mocked(getAllSans).mockReset()
})

describe('parseOptionalSanIdQuery', () => {
  it('returns null when absent', () => {
    expect(parseOptionalSanIdQuery(eventWithQuery())).toBeNull()
  })
  it('returns trimmed id', () => {
    expect(parseOptionalSanIdQuery(eventWithQuery('  abc  '))).toBe('abc')
  })
})

describe('resolveScopedSanIdForRead', () => {
  it('returns explicit sanId when multiple actives', () => {
    vi.mocked(getAllSans).mockReturnValue([
      { id: 'a', status: 'active' } as any,
      { id: 'b', status: 'active' } as any,
    ])
    expect(resolveScopedSanIdForRead(eventWithQuery('a'))).toBe('a')
  })

  it('throws 400 when multiple actives and no sanId', () => {
    vi.mocked(getAllSans).mockReturnValue([
      { id: 'a', status: 'active' } as any,
      { id: 'b', status: 'active' } as any,
    ])
    expect(() => resolveScopedSanIdForRead(eventWithQuery())).toThrowError(
      /sanId is required when multiple SANs are configured/i,
    )
  })

  it('returns sole active id when one active and no query', () => {
    vi.mocked(getAllSans).mockReturnValue([{ id: 'only', status: 'active' } as any])
    expect(resolveScopedSanIdForRead(eventWithQuery())).toBe('only')
  })

  it('returns null when zero active', () => {
    vi.mocked(getAllSans).mockReturnValue([{ id: 'x', status: 'inactive' } as any])
    expect(resolveScopedSanIdForRead(eventWithQuery())).toBeNull()
  })
})

describe('runReadWithSanScope', () => {
  it('runs fn when zero active (no context)', async () => {
    vi.mocked(getAllSans).mockReturnValue([])
    let ran = false
    await runReadWithSanScope(eventWithQuery(), async () => {
      ran = true
    })
    expect(ran).toBe(true)
  })
})
