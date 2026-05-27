import { retrySanBinaryDeployment } from '~~/server/utils/deployment-san-deploy'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const jobId = getRouterParam(event, 'jobId')!
  const job = await retrySanBinaryDeployment(jobId, sanId)
  return { ok: true, job }
})
