import { decodeTargetParam } from '~/server/utils/scst-api-helpers'
import { hasConfiguredSSH, withSanContext } from '~/server/utils/ssh-runtime'
import { requireSanIdQuery } from '~/server/utils/san-query'
import { preflightCreateGroup, preflightDeleteGroup } from '~/server/utils/scst-hosts-preflight'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const body = await readBody<{ action?: string; groupName?: string }>(event)

  if (!body?.action || !body.groupName) {
    throw createError({ statusCode: 400, message: 'action et groupName requis' })
  }

  if (!(await hasConfiguredSSH())) {
    throw createError({ statusCode: 503, message: 'SSH non configuré' })
  }
  const sanId = requireSanIdQuery(event)

  return withSanContext(sanId, async () => {
    if (body.action === 'create_group') {
      return preflightCreateGroup(targetName, body.groupName!)
    }
    if (body.action === 'delete_group') {
      return preflightDeleteGroup(targetName, body.groupName!)
    }
    throw createError({ statusCode: 400, message: 'action invalide (create_group | delete_group)' })
  })
})
