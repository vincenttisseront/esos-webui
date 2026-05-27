import { getSanBinaryDeploymentContext } from '~~/server/utils/binary-deployment-san-context'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const { context, readinessStatus, readinessError } = await getSanBinaryDeploymentContext(sanId)
  return { ok: true, context, readinessStatus, readinessError }
})
