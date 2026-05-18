import { getAllSans } from '../../../db/repositories/san.repository'

export default defineEventHandler(() => {
  return getAllSans()
})
