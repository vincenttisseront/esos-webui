import { deleteCatalogEntryOnly } from '~~/server/utils/deployment-binaries-service'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  deleteCatalogEntryOnly(id)
  return { ok: true }
})
