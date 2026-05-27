import { deletePhysicalFile } from '~~/server/utils/deployment-binaries-service'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const result = await deletePhysicalFile(id)
  return { ok: true, ...result }
})
