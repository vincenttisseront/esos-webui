import { getAllSettings } from '../../db/repositories/settings.repository'

export default defineEventHandler(async () => {
  return getAllSettings()
})
