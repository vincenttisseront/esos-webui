import { decodeGroupParam, decodeTargetParam } from '~/server/utils/scst-api-helpers'
import { hasConfiguredSSH, withSanContext } from '~/server/utils/ssh-runtime'
import { requireSanIdQuery } from '~/server/utils/san-query'
import { preflightMapLun } from '~/server/utils/scst-hosts-preflight'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{ lunId?: number; deviceName?: string; readOnly?: boolean }>(event)

  if (body?.lunId == null || !body?.deviceName) {
    throw createError({ statusCode: 400, message: 'lunId et deviceName requis' })
  }

  if (!(await hasConfiguredSSH())) {
    throw createError({ statusCode: 503, message: 'SSH non configuré' })
  }
  const sanId = requireSanIdQuery(event)
  return withSanContext(sanId, () =>
    preflightMapLun(targetName, groupName, body.lunId!, body.deviceName!, body.readOnly),
  )
})
