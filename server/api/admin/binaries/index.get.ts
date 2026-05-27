import { listCatalogEnriched } from '~~/server/utils/deployment-binaries-service'

export default defineEventHandler(async () => {
  const binaries = await listCatalogEnriched()
  return { binaries }
})
