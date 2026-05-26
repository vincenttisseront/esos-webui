import { applyAluaClusterPlan } from '../../../utils/alua-cluster-apply'
import { consumePlanToken } from '../../../utils/alua-plan-token'
import type { AluaClusterPlan } from '../../../../types/alua'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    planToken?: string
    plan?: AluaClusterPlan
    confirmation?: string
  }>(event).catch(() => ({}))

  const confirmation = typeof body.confirmation === 'string' ? body.confirmation : ''
  let plan: AluaClusterPlan | null = null

  if (body.planToken) {
    plan = consumePlanToken(body.planToken)
    if (!plan) {
      throw createError({ statusCode: 400, statusMessage: 'Plan expiré ou invalide — regénérez le plan' })
    }
  } else if (body.plan) {
    plan = body.plan
  }

  if (!plan) {
    throw createError({ statusCode: 400, statusMessage: 'planToken ou plan requis' })
  }

  try {
    return await applyAluaClusterPlan(plan, confirmation)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur application ALUA',
      data: err.data,
    })
  }
})
