import { getMissingToolsOperation } from '~~/server/utils/missing-tools-operations-store'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id requis' })

  const op = getMissingToolsOperation(id)
  if (!op || op.sanId !== sanId) throw createError({ statusCode: 404, statusMessage: `Opération ${id} introuvable` })
  return op
})

