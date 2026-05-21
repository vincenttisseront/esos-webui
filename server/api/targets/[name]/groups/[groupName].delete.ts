import { deleteGroup } from '~/server/utils/scst-config-writer'
import { decodeGroupParam, decodeTargetParam, requireScstMutationContext } from '~/server/utils/scst-api-helpers'
import { expectedDeleteGroupConfirmation } from '~/utils/scst-initiator-validation'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  let body: { force?: boolean; confirmation?: string } = {}
  try {
    body = await readBody(event)
  } catch {
    /* DELETE sans corps */
  }

  await requireScstMutationContext(event, async () => {
    if (body?.force && body.confirmation) {
      const expected = expectedDeleteGroupConfirmation(targetName, groupName)
      if (body.confirmation.trim() !== expected) {
        throw createError({ statusCode: 400, message: `Confirmation requise : ${expected}` })
      }
    }
    await deleteGroup(targetName, groupName, { force: body?.force })
  })
  return { ok: true }
})
