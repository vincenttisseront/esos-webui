import { decodeGroupParam, decodeTargetParam } from '~/server/utils/scst-api-helpers'
import { hasConfiguredSSH, withSanContext } from '~/server/utils/ssh-runtime'
import { requireSanIdQuery } from '~/server/utils/san-query'
import { preflightAddInitiator } from '~/server/utils/scst-hosts-preflight'
import type { InitiatorType } from '~/utils/scst-initiator-validation'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{ initiator?: string; type?: InitiatorType }>(event)

  if (!body?.initiator) {
    throw createError({ statusCode: 400, message: 'initiator requis' })
  }

  if (!(await hasConfiguredSSH())) {
    throw createError({ statusCode: 503, message: 'SSH non configuré' })
  }
  const sanId = requireSanIdQuery(event)
  return withSanContext(sanId, () =>
    preflightAddInitiator(targetName, groupName, body.initiator!, body.type),
  )
})
