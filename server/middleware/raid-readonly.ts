import { getAllSans } from '../db/repositories/san.repository'

/**
 * Middleware Nitro — Blocage des mutations RAID sur un SAN en lecture seule.
 *
 * Les routes /api/raid/... reçoivent le SAN via ?sanId=... (query param).
 * Le middleware san-readonly.ts ne les couvre pas car il ne regarde que le path.
 */
export default defineEventHandler((event) => {
  const method = getMethod(event)

  // Laisser passer les lectures
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  const path = getRequestURL(event).pathname

  // Ne concerne que /api/raid/...
  if (!path.startsWith('/api/raid/')) return

  // Récupérer le sanId depuis la query string
  const { sanId } = getQuery(event) as { sanId?: string }
  if (!sanId) return

  const san = getAllSans().find(s => s.id === sanId)
  if (!san) return

  if (san.readOnly) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Ce SAN est en lecture seule. Désactivez la protection dans Administration → SANs pour autoriser les modifications.',
    })
  }
})
