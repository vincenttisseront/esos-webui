/**
 * GET /api/admin/app-version/history — Historique des versions WebUI (SDD v3.13 §10.2).
 * Admin only.
 */
import { getQuery } from 'h3'
import { listAppVersionHistory } from '../../../db/repositories/app-version.repository'

export default defineEventHandler((event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Accès réservé aux administrateurs.' })
  }

  const { limit } = getQuery(event) as { limit?: string }
  const n = Math.min(Number(limit) || 50, 200)
  return listAppVersionHistory(n)
})
