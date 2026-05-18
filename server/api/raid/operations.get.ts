/**
 * GET /api/raid/operations — Liste des opérations RAID (SDD v3.12 §8.5).
 * Utilise un store mémoire en Phase 1 (DB en Phase 5).
 */
import { getRaidOperations } from '../../utils/raid-operations-store'

export default defineEventHandler(async (event) => {
  const { sanId } = getQuery(event) as { sanId?: string }
  const ops = getRaidOperations(sanId)
  return ops.slice(0, 100) // limiter à 100 entrées
})
