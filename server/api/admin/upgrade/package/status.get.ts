/**
 * GET /api/admin/upgrade/package/status?sanId= | ?stagingId=
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { sanId?: string; stagingId?: string }
  const { getUpgradePackageStatus, getUpgradePackageStatusBySan } = await import(
    '../../../../utils/upgrade-package-store',
  )

  if (query.stagingId) {
    const s = getUpgradePackageStatus(String(query.stagingId))
    if (!s) throw createError({ statusCode: 404, message: 'Staging introuvable' })
    return s
  }

  if (query.sanId) {
    const s = getUpgradePackageStatusBySan(String(query.sanId))
    return s ?? null
  }

  throw createError({ statusCode: 400, message: 'sanId ou stagingId requis' })
})
