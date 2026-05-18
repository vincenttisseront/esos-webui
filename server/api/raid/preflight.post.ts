/**
 * POST /api/raid/preflight — Vérification préflight (SDD v3.12 §8.2).
 */
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { collectRaidOverview } from '../../utils/raid-overview.service'
import { runPreflight } from '../../utils/raid-preflight'
import { withCache } from '../../utils/cache'
import { requireSanIdQuery } from '../../utils/san-query'
import type { RaidPreflightRequest } from '../../utils/raid-types'

const VALID_ACTIONS = [
  'create_hw_ld', 'delete_hw_ld', 'add_hotspare', 'remove_hotspare',
  'create_md', 'prepare_md_partitions', 'stop_md', 'md_add_device', 'md_set_faulty', 'md_remove_device',
]

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<RaidPreflightRequest>(event)

  if (!body?.backend || !body?.action) {
    throw createError({ statusCode: 400, statusMessage: 'backend et action requis' })
  }
  if (!VALID_ACTIONS.includes(body.action)) {
    throw createError({ statusCode: 400, statusMessage: `Action invalide : ${body.action}` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const cacheKey = `raid-overview-${sanId}`
    const overview = await withCache(cacheKey, 60_000, () => collectRaidOverview(manager))
    return runPreflight(manager, body, overview.blockDevices, overview.mdArrays, overview.tools)
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur préflight',
    })
  }
})
