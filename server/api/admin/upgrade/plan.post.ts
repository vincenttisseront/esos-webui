/**
 * POST /api/admin/upgrade/plan
 * Génère un plan de mise à niveau (affichage uniquement, pas d'exécution).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    sanId?: string
    clusterId?: string
    nodeIds?: string[]
    targetVersion?: string
    packageStagingId?: string
  }>(event)

  const { buildUpgradePlan } = await import('../../../utils/upgrade-plan')
  return buildUpgradePlan({
    sanId: body?.sanId,
    clusterId: body?.clusterId,
    nodeIds: body?.nodeIds,
    targetVersion: body?.targetVersion,
    packageStagingId: body?.packageStagingId,
  })
})
