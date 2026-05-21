/**
 * GET /api/admin/upgrade/readiness?sanId= | ?clusterId= | ?nodeIds[]=
 * Analyse de préparation à la mise à niveau ESOS (lecture seule).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event) as {
    sanId?: string
    clusterId?: string
    nodeIds?: string | string[]
  }

  const nodeIds = query.nodeIds
    ? (Array.isArray(query.nodeIds) ? query.nodeIds : [query.nodeIds])
    : undefined

  if (!query.sanId && !query.clusterId && !nodeIds?.length) {
    throw createError({
      statusCode: 400,
      message: 'sanId, clusterId ou nodeIds requis',
      data: { code: 'upgrade.scope_required' },
    })
  }

  const { buildUpgradeReadinessReport } = await import('../../../utils/upgrade-readiness')
  return buildUpgradeReadinessReport({
    sanId: typeof query.sanId === 'string' ? query.sanId : undefined,
    clusterId: typeof query.clusterId === 'string' ? query.clusterId : undefined,
    nodeIds,
  })
})
