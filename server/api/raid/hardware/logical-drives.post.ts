/**
 * POST /api/raid/hardware/logical-drives — Créer un logical drive (SDD v3.12 §8.3).
 * Gated par RAID_HARDWARE_WRITE_ENABLED.
 */
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { collectRaidOverview } from '../../../utils/raid-overview.service'
import { withCache, invalidateCacheKey } from '../../../utils/cache'
import { requireSanIdQuery } from '../../../utils/san-query'
import { executeHwLogicalDriveCreate } from '../../../utils/raid-hw-ld-create'
import type { CreateHardwareLogicalDriveRequest } from '../../../utils/raid-types'

const WRITE_ENABLED = process.env.RAID_HARDWARE_WRITE_ENABLED !== 'false'
  && process.env.RAID_WRITE_ACTIONS_ENABLED !== 'false'

const VALID_LEVELS = ['0', '1', '5', '6', '10']

export default defineEventHandler(async (event) => {
  if (!WRITE_ENABLED) {
    throw createError({ statusCode: 403, statusMessage: 'Hardware RAID write désactivé (RAID_HARDWARE_WRITE_ENABLED=false)' })
  }

  const sanId = requireSanIdQuery(event)
  const body = await readBody<CreateHardwareLogicalDriveRequest>(event)

  if (!body?.controllerId || !body?.raidLevel || !body?.drives?.length) {
    throw createError({ statusCode: 400, statusMessage: 'controllerId, raidLevel et drives requis' })
  }
  if (!VALID_LEVELS.includes(body.raidLevel)) {
    throw createError({ statusCode: 400, statusMessage: `Niveau RAID invalide : ${body.raidLevel}` })
  }
  if (!body.readPolicy || !body.writePolicy) {
    throw createError({ statusCode: 400, statusMessage: 'readPolicy et writePolicy requis' })
  }
  const confirmation = body.confirmation?.trim()
  if (!confirmation) {
    throw createError({ statusCode: 400, statusMessage: 'confirmation requise' })
  }
  const expectedConfirm = `CREATE LD ${body.raidLevel}`
  if (confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }

    const cacheKey = `raid-overview-${sanId}`
    const overview = await withCache(cacheKey, 60_000, () => collectRaidOverview(manager))
    const ctrl = overview.hardwareControllers.find(c => c.id === body.controllerId)
    if (!ctrl) {
      throw createError({ statusCode: 404, statusMessage: `Contrôleur ${body.controllerId} introuvable` })
    }
    if (!ctrl.supportsCreate) {
      throw createError({ statusCode: 422, statusMessage: 'Ce contrôleur ne supporte pas la création via CLI' })
    }

    const result = await executeHwLogicalDriveCreate(manager, cacheKey, ctrl, body)

    invalidateCacheKey(cacheKey)
    invalidateCacheKey(`lvm-overview-${sanId}`)
    return result
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur création LD',
      data: err.data,
    })
  }
})
