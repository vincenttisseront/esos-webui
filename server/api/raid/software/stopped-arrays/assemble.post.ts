/**
 * POST /api/raid/software/stopped-arrays/assemble — Assembler un tableau MD arrêté.
 */
import { handleStoppedMdAssemble } from '../../../../utils/raid-stopped-md-handlers'

export default defineEventHandler(handleStoppedMdAssemble)
