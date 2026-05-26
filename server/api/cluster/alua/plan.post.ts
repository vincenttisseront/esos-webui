import type { AluaWizardRequest } from '../../../../types/alua'
import { resolveClusterMembers } from '../../../../utils/cluster-resolve'
import { collectPreflightNodes, runAluaWizardPreflight } from '../../../../utils/alua-wizard-preflight'
import { buildAluaClusterPlan } from '../../../../utils/alua-wizard-plan'

export default defineEventHandler(async (event) => {
  const body = await readBody<AluaWizardRequest>(event)
  if (!body?.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId requis' })
  }
  const members = resolveClusterMembers({ clusterId: body.clusterId })
  const nodes = await collectPreflightNodes(members)
  const preflight = runAluaWizardPreflight(members, nodes, body)
  if (!preflight.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Préflight ALUA échoué',
      data: { preflight },
    })
  }
  return buildAluaClusterPlan(body, nodes)
})
