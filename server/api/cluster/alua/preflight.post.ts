import type { AluaWizardRequest } from '../../../../types/alua'
import { resolveClusterMembers } from '../../../../utils/cluster-resolve'
import { collectPreflightNodes, runAluaWizardPreflight } from '../../../../utils/alua-wizard-preflight'

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<AluaWizardRequest>>(event).catch(() => ({}))
  const clusterId = typeof body.clusterId === 'string' ? body.clusterId.trim() : ''
  if (!clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId requis' })
  }
  const members = resolveClusterMembers({ clusterId })
  const nodes = await collectPreflightNodes(members)
  return runAluaWizardPreflight(members, nodes, { ...body, clusterId })
})
