import { deleteCatalogAndFile } from '~~/server/utils/deployment-binaries-service'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const result = await deleteCatalogAndFile(id)
  return { ok: true, ...result }
})
