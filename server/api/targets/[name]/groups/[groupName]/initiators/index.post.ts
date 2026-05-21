import { addInitiator } from '~/server/utils/scst-config-writer'
import { decodeGroupParam, decodeTargetParam, requireScstMutationContext } from '~/server/utils/scst-api-helpers'
import { validateInitiatorValue, type InitiatorType } from '~/utils/scst-initiator-validation'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{ initiator?: string; type?: InitiatorType; ibOneTargetPerPort?: boolean }>(event)

  const v = validateInitiatorValue(body?.initiator ?? '', {
    type: body?.type ?? 'auto',
    ibOneTargetPerPort: body?.ibOneTargetPerPort,
  })
  if (!v.ok || !v.normalized) {
    throw createError({ statusCode: 400, message: v.message ?? 'initiator invalide' })
  }

  let result: { initiator: string } = { initiator: v.normalized }
  await requireScstMutationContext(event, async () => {
    result = await addInitiator(targetName, groupName, v.normalized!, {
      type: body?.type,
      ibOneTargetPerPort: body?.ibOneTargetPerPort,
    })
  })
  return { ok: true, initiator: result.initiator }
})
