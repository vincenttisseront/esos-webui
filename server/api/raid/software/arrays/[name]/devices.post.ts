/**
 * POST /api/raid/software/arrays/[name]/devices — Ajouter un membre à un MD array (SDD v3.12 §8.4).
 */
import { requireSanIdQuery } from '../../../../../utils/san-query'
import { runAddMdMember } from '../../../../../utils/raid-cluster-md-execution'
import type { AddMdMemberRequest } from '../../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const name = getRouterParam(event, 'name')
  const body = await readBody<AddMdMemberRequest>(event)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'name requis' })
  if (!body?.device) throw createError({ statusCode: 400, statusMessage: 'device requis' })
  if (!body.intent) throw createError({ statusCode: 400, statusMessage: 'intent requis' })
  if (!body.confirmation) throw createError({ statusCode: 400, statusMessage: 'confirmation requise' })

  try {
    return await runAddMdMember(sanId, name, body)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur add device MD',
      data: err.data,
    })
  }
})
