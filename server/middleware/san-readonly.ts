import { getAllSans } from '../db/repositories/san.repository'

const READONLY_ERROR = 'Ce SAN est en lecture seule. Désactivez la protection dans Administration → SANs pour autoriser les modifications.'

function blockIfReadonly(sanId: string | undefined) {
  if (!sanId) return
  const san = getAllSans().find(s => s.id === sanId)
  if (!san) return  // Laisse le route handler gérer l'ID inconnu
  if (san.readOnly) {
    throw createError({ statusCode: 403, message: READONLY_ERROR })
  }
}

/**
 * Middleware Nitro — Blocage des modifications sur un SAN en lecture seule.
 *
 * Intercepte toutes les requêtes de mutation (non-GET) sur :
 *   - /api/san/{sanId}/… (sanId dans le path)
 *   - /api/perf/…       (sanId dans ?sanId=)
 */
export default defineEventHandler((event) => {
  const method = getMethod(event)

  // Laisser passer les lectures
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  const path = getRequestURL(event).pathname

  // /api/san/{sanId}/...
  const m = path.match(/^\/api\/san\/([^/]+)\//)
  if (m) {
    blockIfReadonly(decodeURIComponent(m[1]))
    return
  }

  // /api/perf/... — sanId dans la query string
  if (path.startsWith('/api/perf/')) {
    const { sanId } = getQuery(event) as { sanId?: string }
    blockIfReadonly(sanId)
  }
})
