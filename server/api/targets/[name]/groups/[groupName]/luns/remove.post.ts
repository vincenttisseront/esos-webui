import { removeLunFromGroup } from '~/server/utils/scst-config-writer'
import { decodeGroupParam, decodeTargetParam, requireScstMutationContext } from '~/server/utils/scst-api-helpers'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{ lunId?: number }>(event)

  if (body?.lunId == null) {
    throw createError({ statusCode: 400, message: 'lunId requis' })
  }

  await requireScstMutationContext(event, async () => {
    await removeLunFromGroup(targetName, groupName, body.lunId!)
  })
  return { ok: true }
})
