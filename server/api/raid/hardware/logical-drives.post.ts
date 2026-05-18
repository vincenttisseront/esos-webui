/**
 * POST /api/raid/hardware/logical-drives — Créer un logical drive (SDD v3.12 §8.3).
 * Gated par RAID_HARDWARE_WRITE_ENABLED.
 */
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { collectRaidOverview } from '../../../utils/raid-overview.service'
import { withCache, invalidateCacheKey } from '../../../utils/cache'
import {
  buildStorCliCreateLd,
  buildMegaCliCreateLd,
  buildArcconfCreateLd,
} from '../../../utils/raid-hardware'
import { requireSanIdQuery } from '../../../utils/san-query'
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
  if (!body.confirmation) {
    throw createError({ statusCode: 400, statusMessage: 'confirmation requise' })
  }
  const expectedConfirm = `CREATE LD ${body.raidLevel}`
  if (body.confirmation !== expectedConfirm) {
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

    let command: string
    if (ctrl.cliTool === 'storcli' || ctrl.cliTool === 'perccli') {
      command = buildStorCliCreateLd(ctrl.cliTool, ctrl.id, body.raidLevel, body.drives, body.writePolicy, body.readPolicy)
    } else if (ctrl.cliTool === 'MegaCli64') {
      command = buildMegaCliCreateLd(ctrl.id, body.raidLevel, body.drives, body.writePolicy, body.readPolicy)
    } else if (ctrl.cliTool === 'arcconf') {
      command = buildArcconfCreateLd(ctrl.id, body.raidLevel, body.drives, body.writePolicy, body.readPolicy)
    } else {
      throw createError({ statusCode: 422, statusMessage: 'Outil CLI inconnu pour ce contrôleur' })
    }

    const { stdout } = await manager.exec(`${command} 2>&1; echo EXIT_CODE=$?`, 120_000)
    if (stdout.match(/EXIT_CODE=[1-9]/)) {
      throw createError({ statusCode: 500, statusMessage: `Échec création LD : ${stdout.slice(-500)}` })
    }

    invalidateCacheKey(cacheKey)
    return { command, stdout: stdout.slice(0, 2000) }
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur création LD',
    })
  }
})
