import { addLunToGroup } from '~/server/utils/scst-config-writer'
import { decodeGroupParam, decodeTargetParam, requireScstMutationContext } from '~/server/utils/scst-api-helpers'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{ lunId?: number; deviceName?: string; readOnly?: boolean }>(event)

  if (body?.lunId == null || !body?.deviceName) {
    throw createError({ statusCode: 400, message: 'lunId et deviceName requis' })
  }

  await requireScstMutationContext(event, async () => {
    await addLunToGroup(targetName, groupName, body.lunId!, body.deviceName!, {
      readOnly: body.readOnly,
    })
  })
  return { ok: true, lunId: body.lunId, deviceName: body.deviceName }
})
