import { removeInitiator } from '~/server/utils/scst-config-writer'
import { decodeGroupParam, decodeTargetParam, requireScstMutationContext } from '~/server/utils/scst-api-helpers'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{ initiator?: string }>(event)
  const initiator = body?.initiator?.trim()
  if (!initiator) {
    throw createError({ statusCode: 400, message: 'initiator requis' })
  }

  await requireScstMutationContext(event, async () => {
    await removeInitiator(targetName, groupName, initiator)
  })
  return { ok: true }
})
