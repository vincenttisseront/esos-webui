import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createEvent, getMethod, getQuery } from 'h3'
import { assertSanWritable } from '../server/utils/san-request-context'

vi.mock('../server/utils/san-request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/san-request-context')>()
  return {
    ...actual,
    assertSanWritable: vi.fn(),
  }
})

const MUTATION_PREFIXES = [
  '/api/raid/',
  '/api/lvm/',
  '/api/fs/',
  '/api/targets/',
  '/api/devices/',
  '/api/cluster/',
  '/api/admin/upgrade/',
]

function pathnameFromEvent(event: ReturnType<typeof createEvent>): string {
  const raw = event.path ?? event.node.req.url ?? '/'
  try {
    return new URL(raw, 'http://localhost').pathname
  } catch {
    return raw.split('?')[0]
  }
}

function runStorageReadonlyGuard(event: ReturnType<typeof createEvent>) {
  const method = getMethod(event)
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  const path = pathnameFromEvent(event)
  if (!MUTATION_PREFIXES.some(p => path.startsWith(p))) return

  const { sanId } = getQuery(event) as { sanId?: string }
  if (!sanId || typeof sanId !== 'string') return

  assertSanWritable(sanId.trim())
}

describe('storage-readonly guard', () => {
  beforeEach(() => {
    vi.mocked(assertSanWritable).mockReset()
  })

  it('skips GET requests', () => {
    const event = createEvent({ method: 'GET', url: '/api/fs/overview?sanId=s1' })
    runStorageReadonlyGuard(event)
    expect(assertSanWritable).not.toHaveBeenCalled()
  })

  it('calls assertSanWritable on POST with sanId', () => {
    const event = createEvent({
      method: 'POST',
      url: 'http://localhost/api/fs/create?sanId=s1',
      path: '/api/fs/create',
    })
    runStorageReadonlyGuard(event)
    expect(assertSanWritable).toHaveBeenCalledWith('s1')
  })

  it('skips POST without sanId', () => {
    const event = createEvent({
      method: 'POST',
      url: 'http://localhost/api/fs/create',
      path: '/api/fs/create',
    })
    runStorageReadonlyGuard(event)
    expect(assertSanWritable).not.toHaveBeenCalled()
  })

  it('calls assertSanWritable on upgrade package upload', () => {
    const event = createEvent({
      method: 'POST',
      url: 'http://localhost/api/admin/upgrade/package/upload?sanId=san-ro',
      path: '/api/admin/upgrade/package/upload',
    })
    runStorageReadonlyGuard(event)
    expect(assertSanWritable).toHaveBeenCalledWith('san-ro')
  })
})
