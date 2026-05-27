/**
 * DELETE /api/raid/hardware/logical-drives/[id] — Supprimer un LD (SDD v3.12 §8.3).
 */
import type { H3Event } from 'h3'
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import { collectRaidOverview } from '../../../../utils/raid-overview.service'
import { withCache, invalidateCacheKey } from '../../../../utils/cache'
import { requireSanIdQuery } from '../../../../utils/san-query'
import { assertHardwareLdNotEsosProtected } from '../../../../utils/esos-system-protection'
import {
  buildHwDeleteLdCommand,
  expectedDeleteHwLdConfirmation,
  hardwareLdIdsMatch,
  normalizeHardwareLdRouteId,
} from '../../../../../utils/raid-hw-cli-create'

const WRITE_ENABLED = process.env.RAID_HARDWARE_WRITE_ENABLED !== 'false'
  && process.env.RAID_WRITE_ACTIONS_ENABLED !== 'false'

async function readDeleteConfirmation(event: H3Event, ldId: string): Promise<string> {
  const expected = expectedDeleteHwLdConfirmation(ldId)
  const query = getQuery(event)
  const header = getRequestHeader(event, 'x-raid-confirmation')

  let bodyConfirmation: string | undefined
  try {
    const body = await readBody<{ confirmation?: string }>(event)
    bodyConfirmation = body?.confirmation
  } catch {
    bodyConfirmation = undefined
  }

  const candidates = [
    bodyConfirmation,
    typeof query.confirmation === 'string' ? query.confirmation : undefined,
    header ?? undefined,
  ].filter((c): c is string => typeof c === 'string' && c.length > 0)

  for (const c of candidates) {
    if (c === expected) return c
  }

  throw createError({
    statusCode: 400,
    statusMessage: candidates.length === 0
      ? `Confirmation requise (attendu : "${expected}"). Les corps de requête DELETE peuvent être ignorés par le proxy — réessayez après mise à jour du client.`
      : `Confirmation invalide (attendu : "${expected}")`,
  })
}

export default defineEventHandler(async (event) => {
  if (!WRITE_ENABLED) {
    throw createError({ statusCode: 403, statusMessage: 'Hardware RAID write désactivé' })
  }

  const sanId = requireSanIdQuery(event)
  const rawId = getRouterParam(event, 'id')
  if (!rawId) throw createError({ statusCode: 400, statusMessage: 'id requis' })

  const ldId = normalizeHardwareLdRouteId(rawId)
  await readDeleteConfirmation(event, ldId)

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }

    const cacheKey = `raid-overview-${sanId}`
    const overview = await withCache(cacheKey, 60_000, () => collectRaidOverview(manager))

    const protection = overview.systemProtection
    if (protection) {
      assertHardwareLdNotEsosProtected(ldId, protection, overview.hardwareControllers)
    }

    let command: string | null = null
    for (const ctrl of overview.hardwareControllers) {
      const ld = ctrl.logicalDrives.find(l => hardwareLdIdsMatch(l.id, ldId))
      if (!ld) continue

      command = buildHwDeleteLdCommand({
        cliTool: ctrl.cliTool,
        cliPath: ctrl.cliPath,
        controllerId: ctrl.id,
        ldId: ld.id,
      })
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
