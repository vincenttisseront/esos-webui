import { buildAluaWizardInventory } from '../../../../utils/alua-wizard-inventory'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clusterId = typeof query.clusterId === 'string' ? query.clusterId.trim() : ''
  if (!clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId requis' })
  }
  try {
    return await buildAluaWizardInventory(clusterId)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur inventaire ALUA',
    })
  }
})
