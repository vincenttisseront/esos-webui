import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { requireSanIdQuery } from '../../../utils/san-query'
import { invalidateCacheKey } from '../../../utils/cache'
import { collectRaidOverview } from '../../../utils/raid-overview.service'
import { hwLdOsPath } from '../../../../utils/hw-raid-backend-eligibility'
import { resolveRescanHost } from '../../../../utils/hw-raid-rescan'

type RescanBody = {
  host?: string
  controllerId?: string
  vdId?: string
}

type RescanSnapshot = {
  lsscsi: string
  lsblk: string
}

async function captureRescanSnapshot(manager: NonNullable<ReturnType<typeof getActiveSSHManager>>): Promise<RescanSnapshot> {
  const [lsscsi, lsblk] = await Promise.all([
    manager.exec('lsscsi 2>/dev/null || true', 10_000),
    manager.exec('lsblk -p -b -o NAME,SIZE,TYPE,MODEL,SERIAL,WWN,MOUNTPOINT,FSTYPE 2>/dev/null || true', 10_000),
  ])
  return {
    lsscsi: lsscsi.stdout.trim(),
    lsblk: lsblk.stdout.trim(),
  }
}

async function readDmesgTail(manager: NonNullable<ReturnType<typeof getActiveSSHManager>>): Promise<string> {
  const out = await manager.exec('dmesg | tail -n 80 2>/dev/null || true', 10_000)
  return out.stdout.trim()
}

function globalScanCmd(): string {
  return 'for _h in /sys/class/scsi_host/host*/scan; do [ -w "$_h" ] && echo "- - -" > "$_h"; done 2>/dev/null || true'
}

function targetedScanCmd(host: string): string {
  return `[ -w "/sys/class/scsi_host/host${host}/scan" ] && echo "- - -" > "/sys/class/scsi_host/host${host}/scan" || true`
}

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || !['admin', 'operator'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Action réservée admin/operator' })
  }
  const sanId = requireSanIdQuery(event)
  const body = await readBody<RescanBody>(event)

  return await withSanContext(sanId, async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const beforeOverview = await collectRaidOverview(manager)
    const targetCtrl = body?.controllerId
      ? beforeOverview.hardwareControllers.find(c => c.id === body.controllerId)
      : undefined
    const targetLd = body?.vdId && targetCtrl
      ? targetCtrl.logicalDrives.find(ld => ld.id === body.vdId)
      : undefined
    const host = resolveRescanHost({
      requestedHost: body?.host,
      scsiAddress: targetLd?.scsiAddress,
    })
    const command = host ? targetedScanCmd(host) : globalScanCmd()
    const before = await captureRescanSnapshot(manager)
    await manager.exec(command, 15_000)
    const after = await captureRescanSnapshot(manager)
    const dmesgTail = await readDmesgTail(manager)
    invalidateCacheKey(`raid-overview-${sanId}`)
    invalidateCacheKey(`lvm-overview-${sanId}`)
    invalidateCacheKey(`fs-overview-${sanId}`)
    const afterOverview = await collectRaidOverview(manager)
    const afterCtrl = targetCtrl ? afterOverview.hardwareControllers.find(c => c.id === targetCtrl.id) : undefined
    const afterLd = targetLd && afterCtrl ? afterCtrl.logicalDrives.find(ld => ld.id === targetLd.id) : undefined
    const mappedPath = afterLd ? hwLdOsPath(afterLd) : null
    return {
      ok: true,
      command,
      host: host ?? null,
      foundNewDevice: Boolean(mappedPath),
      mappedPath,
      diagnostics: {
        vdId: afterLd?.id ?? body?.vdId ?? null,
        controllerId: afterCtrl?.id ?? body?.controllerId ?? null,
        expectedSizeBytes: afterLd?.sizeBytes ?? targetLd?.sizeBytes ?? null,
        lsscsiBefore: before.lsscsi,
        lsscsiAfter: after.lsscsi,
        lsblkBefore: before.lsblk,
        lsblkAfter: after.lsblk,
        dmesgTail,
      },
    }
  })
})
