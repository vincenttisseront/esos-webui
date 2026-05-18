import { eq } from 'drizzle-orm'
import { getDB } from '../../../db'
import { clusters } from '../../../db/schema'

interface Body { name: string }

/**
 * PATCH /api/admin/clusters/:id — Renomme un cluster existant.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'id manquant' })

  const body = await readBody<Body>(event)
  const name = body.name?.trim()
  if (!name) throw createError({ statusCode: 400, message: 'Le nom du cluster est requis.' })

  const db  = getDB()
  const now = new Date().toISOString()

  db.update(clusters).set({ name, updatedAt: now }).where(eq(clusters.id, id)).run()

  return { id, name }
})
