/**
 * DELETE /api/raid/hardware/logical-drives/[id] — Supprimer un LD (SDD v3.12 §8.3).
 */
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import { collectRaidOverview } from '../../../../utils/raid-overview.service'
import { withCache, invalidateCacheKey } from '../../../../utils/cache'
import { requireSanIdQuery } from '../../../../utils/san-query'

const WRITE_ENABLED = process.env.RAID_HARDWARE_WRITE_ENABLED !== 'false'
  && process.env.RAID_WRITE_ACTIONS_ENABLED !== 'false'

export default defineEventHandler(async (event) => {
  if (!WRITE_ENABLED) {
    throw createError({ statusCode: 403, statusMessage: 'Hardware RAID write désactivé' })
  }

  const sanId = requireSanIdQuery(event)
  const ldId = getRouterParam(event, 'id')
  const body = await readBody<{ confirmation: string }>(event)

  if (!ldId) throw createError({ statusCode: 400, statusMessage: 'id requis' })

  const expectedConfirm = `DELETE LD ${ldId}`
  if (!body?.confirmation || body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }

    const cacheKey = `raid-overview-${sanId}`
    const overview = await withCache(cacheKey, 60_000, () => collectRaidOverview(manager))

    // Trouver le LD et son contrôleur
    let command: string | null = null
    for (const ctrl of overview.hardwareControllers) {
      const ld = ctrl.logicalDrives.find(l => l.id === ldId)
      if (!ld) continue

      if (ctrl.cliTool === 'storcli' || ctrl.cliTool === 'perccli') {
        const ldNum = ldId.split('/vd')[1] ?? '0'
        command = `${ctrl.cliTool} /c${ctrl.id}/v${ldNum} del force`
      } else if (ctrl.cliTool === 'MegaCli64') {
        const ldNum = ldId.split('/ld')[1] ?? '0'
        command = `MegaCli64 -CfgLdDel -L${ldNum} -a${ctrl.id}`
      } else if (ctrl.cliTool === 'arcconf') {
        const ldNum = ldId.split('/ld')[1] ?? '0'
        command = `arcconf DELETE ${ctrl.id} LOGICALDRIVE ${ldNum}`
      }
      break
    }

    if (!command) {
      throw createError({ statusCode: 404, statusMessage: `LD ${ldId} introuvable` })
    }

    const { stdout } = await manager.exec(`${command} 2>&1; echo EXIT_CODE=$?`, 60_000)
    if (stdout.match(/EXIT_CODE=[1-9]/)) {
      throw createError({ statusCode: 500, statusMessage: `Échec suppression LD : ${stdout.slice(-500)}` })
    }

    invalidateCacheKey(cacheKey)
    return { command, stdout: stdout.slice(0, 2000) }
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur suppression LD',
    })
  }
})
