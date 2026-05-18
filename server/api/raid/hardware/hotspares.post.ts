/**
 * POST /api/raid/hardware/hotspares — Ajouter un hot spare matériel (SDD v3.12 §8.4).
 */
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { requireSanIdQuery } from '../../../utils/san-query'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)

  const body = await readBody<{
    controllerId: string
    enclosure?: string
    slot: string
    ldId?: string        // undefined = global hot spare
    confirmation: string
  }>(event)

  if (!body?.controllerId || !body?.slot) {
    throw createError({ statusCode: 400, message: 'controllerId et slot requis' })
  }
  if (!body.confirmation) {
    throw createError({ statusCode: 400, message: 'confirmation requise' })
  }

  if (!process.env.RAID_WRITE_ACTIONS_ENABLED || process.env.RAID_WRITE_ACTIONS_ENABLED === 'false') {
    throw createError({
      statusCode: 503,
      message: 'Les actions RAID hardware sont désactivées (RAID_WRITE_ACTIONS_ENABLED=false)',
    })
  }
  if (!process.env.RAID_HARDWARE_WRITE_ENABLED || process.env.RAID_HARDWARE_WRITE_ENABLED === 'false') {
    throw createError({
      statusCode: 503,
      message: 'Les actions RAID hardware sont désactivées (RAID_HARDWARE_WRITE_ENABLED=false)',
    })
  }

  const expectedPhrase = `ADD HOTSPARE ${body.slot}`
  if (body.confirmation !== expectedPhrase) {
    throw createError({
      statusCode: 422,
      message: `Phrase de confirmation incorrecte. Attendu : "${expectedPhrase}"`,
    })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const enc = body.enclosure ?? '255'
    const slot = body.slot

    const cmd = `storcli /c${body.controllerId}/e${enc}/s${slot} add hotsparedrive || `
      + `MegaCli64 -PDHSP -Set -PhysDrv[${enc}:${slot}] -a${body.controllerId}`

    const { stdout } = await manager.exec(cmd, 30_000)
    return { stdout: stdout.trim(), slot }
  }

  const result = await withSanContext(sanId, run)
  return { ok: true, ...result }
})
