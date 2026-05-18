import { randomUUID } from 'node:crypto'
import { getDB } from '../../../db'
import { clusters } from '../../../db/schema'

interface Body { name: string }

/**
 * POST /api/admin/clusters — Crée un nouveau cluster nommé.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const name = body.name?.trim()
  if (!name) throw createError({ statusCode: 400, message: 'Le nom du cluster est requis.' })

  const db  = getDB()
  const now = new Date().toISOString()
  const id  = randomUUID()

  db.insert(clusters).values({ id, name, createdAt: now, updatedAt: now }).run()

  return { id, name, createdAt: now, updatedAt: now }
})
