/**
 * GET /api/admin/upgrade/plan/:id
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'id requis' })
  }
  const { getUpgradePlan } = await import('../../../../utils/upgrade-plan-store')
  const plan = getUpgradePlan(id)
  if (!plan) {
    throw createError({ statusCode: 404, message: 'Plan introuvable ou expiré' })
  }
  return plan
})
