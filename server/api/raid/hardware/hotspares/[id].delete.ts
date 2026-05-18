/**
 * DELETE /api/raid/hardware/hotspares/[id] — Retirer un hot spare matériel (SDD v3.12 §8.4).
 * [id] format: {controllerId}_{enclosure}_{slot}  ex: 0_255_2
 */
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import { requireSanIdQuery } from '../../../../utils/san-query'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const id = getRouterParam(event, 'id')

  if (!id) throw createError({ statusCode: 400, message: 'id requis' })

  const body = await readBody<{ confirmation: string }>(event)
  if (!body?.confirmation) {
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

  const parts = id.split('_')
  if (parts.length < 3) {
    throw createError({ statusCode: 400, message: 'id invalide. Format attendu : {ctrl}_{enc}_{slot}' })
  }
  const [controllerId, enclosure, slot] = parts

  const expectedPhrase = `REMOVE HOTSPARE ${slot}`
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
    const cmd = `storcli /c${controllerId}/e${enclosure}/s${slot} delete hotsparedrive || `
      + `MegaCli64 -PDHSP -Rmv -PhysDrv[${enclosure}:${slot}] -a${controllerId}`
    const { stdout } = await manager.exec(cmd, 30_000)
    return { stdout: stdout.trim() }
  }

  const result = await withSanContext(sanId, run)
  return { ok: true, ...result }
})
