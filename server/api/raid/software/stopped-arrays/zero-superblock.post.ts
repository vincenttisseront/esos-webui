/**
 * POST /api/raid/software/stopped-arrays/zero-superblock — Supprimer les superblocks MD (destructif).
 */
import { handleStoppedMdZeroSuperblock } from '../../../../utils/raid-stopped-md-handlers'

export default defineEventHandler(handleStoppedMdZeroSuperblock)
