import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { requireSanIdQuery } from '../../../utils/san-query'
import { invalidateCacheKey } from '../../../utils/cache'

function globalScanCmd(): string {
  return 'for _h in /sys/class/scsi_host/host*/scan; do [ -w "$_h" ] && echo "- - -" > "$_h"; done 2>/dev/null || true'
}

function targetedScanCmd(host: string): string {
  return `[ -w "/sys/class/scsi_host/host${host}/scan" ] && echo "- - -" > "/sys/class/scsi_host/host${host}/scan" || true`
}

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<{ host?: string }>(event)

  return await withSanContext(sanId, async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const host = body?.host?.trim()
    const command = host && /^\d+$/.test(host) ? targetedScanCmd(host) : globalScanCmd()
    await manager.exec(command, 15_000)
    invalidateCacheKey(`raid-overview-${sanId}`)
    invalidateCacheKey(`lvm-overview-${sanId}`)
    invalidateCacheKey(`fs-overview-${sanId}`)
    return { ok: true, command, host: host ?? null }
  })
})
