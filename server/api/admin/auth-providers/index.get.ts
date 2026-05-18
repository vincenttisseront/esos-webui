import { buildAdminAuthProvidersDto } from '../../../utils/auth-providers-config'

export default defineEventHandler(async () => {
  return buildAdminAuthProvidersDto()
})
