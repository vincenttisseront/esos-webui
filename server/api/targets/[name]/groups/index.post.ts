import { createGroup } from '~/server/utils/scst-config-writer'
import { decodeTargetParam, requireScstMutationContext } from '~/server/utils/scst-api-helpers'
import { validateGroupName } from '~/utils/scst-initiator-validation'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const body = await readBody<{ groupName?: string }>(event)
  const v = validateGroupName(body?.groupName ?? '')
  if (!v.ok) {
    throw createError({ statusCode: 400, message: v.message ?? 'groupName invalide' })
  }

  await requireScstMutationContext(event, async () => {
    await createGroup(targetName, v.normalized!)
  })
  return { ok: true, groupName: v.normalized }
})
