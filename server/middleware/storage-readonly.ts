import { assertSanWritable } from '../utils/san-request-context'

const MUTATION_PREFIXES = [
  '/api/raid/',
  '/api/lvm/',
  '/api/fs/',
  '/api/targets/',
  '/api/devices/',
  '/api/cluster/',
]

/**
 * Blocks storage mutations when `?sanId=` refers to a read-only SAN.
 * Routes without sanId in query rely on handler-level checks (cluster body, etc.).
 */
export default defineEventHandler((event) => {
  const method = getMethod(event)
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  const path = getRequestURL(event).pathname
  if (!MUTATION_PREFIXES.some(p => path.startsWith(p))) return

  const { sanId } = getQuery(event) as { sanId?: string }
  if (!sanId || typeof sanId !== 'string') return

  assertSanWritable(sanId.trim())
})
