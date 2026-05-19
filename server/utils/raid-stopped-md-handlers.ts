/**
 * Shared handlers for stopped MD array actions.
 */
import { createError, readBody, type H3Event } from 'h3'
import { getActiveSSHManager, withSanContext } from './ssh-runtime'
import {
  assembleMdArray,
  expectedMdAssembleConfirmation,
  expectedMdZeroSuperblocksConfirmation,
  zeroMdSuperblocks,
} from './raid-md-actions'
import { invalidateCacheKey } from './cache'
import { requireSanIdQuery } from './san-query'
import type { AssembleMdArrayRequest, ZeroMdSuperblocksRequest } from './raid-types'

export async function handleStoppedMdAssemble(event: H3Event) {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<AssembleMdArrayRequest>(event)

  if (!body?.name) {
    throw createError({ statusCode: 400, statusMessage: 'name requis' })
  }
  const expectedConfirm = expectedMdAssembleConfirmation(body.name)
  if (!body.confirmation || body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const result = await assembleMdArray(manager, body)
    invalidateCacheKey(`raid-overview-${sanId}`)
    return result
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur assemblage MD array',
      data: err.data,
    })
  }
}

export async function handleStoppedMdZeroSuperblock(event: H3Event) {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<ZeroMdSuperblocksRequest>(event)

  const arrayName = body?.name ?? ''
  if (!arrayName) {
    throw createError({ statusCode: 400, statusMessage: 'name requis' })
  }
  const members = Array.isArray(body?.members) ? body.members.map(String) : []
  if (members.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'members requis' })
  }

  const expectedConfirm = expectedMdZeroSuperblocksConfirmation(arrayName)
  if (!body?.confirmation || body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const result = await zeroMdSuperblocks(manager, members)
    invalidateCacheKey(`raid-overview-${sanId}`)
    return result
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur nettoyage superblocks MD',
      data: err.data,
    })
  }
}
