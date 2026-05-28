import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { requireSanIdQuery } from '../../../utils/san-query'
import { invalidateCacheKey } from '../../../utils/cache'
import { collectRaidOverview } from '../../../utils/raid-overview.service'
import { hwLdOsPath } from '../../../../utils/hw-raid-backend-eligibility'
import {
  buildRescanOutcome,
  buildRescanPlan,
  diffLines,
  megaraidHostsFromProcNames,
  resolveRescanHost,
  type RescanStep,
} from '../../../../utils/hw-raid-rescan'

type RescanBody = {
  host?: string
  controllerId?: string
  vdId?: string
}

type RescanSnapshot = {
  perccli: string
  lsscsiG: string
  lsscsi: string
  lsblk: string
  hostProcNames: string
}

async function captureRescanSnapshot(manager: NonNullable<ReturnType<typeof getActiveSSHManager>>): Promise<RescanSnapshot> {
  const [perccli, lsscsiG, lsscsi, lsblk, hostProcNames] = await Promise.all([
    manager.exec('command -v perccli >/dev/null 2>&1 && perccli /c0/vall show 2>/dev/null || true', 15_000),
    manager.exec('command -v lsscsi >/dev/null 2>&1 && lsscsi -g 2>/dev/null || true', 10_000),
    manager.exec('lsscsi 2>/dev/null || true', 10_000),
    manager.exec('lsblk -J -O 2>/dev/null || true', 10_000),
    manager.exec('for h in /sys/class/scsi_host/host*; do [ -r "$h/proc_name" ] && printf "%s %s\\n" "$(basename "$h")" "$(cat "$h/proc_name")"; done 2>/dev/null || true', 10_000),
  ])
  return {
    perccli: perccli.stdout.trim(),
    lsscsiG: lsscsiG.stdout.trim(),
    lsscsi: lsscsi.stdout.trim(),
    lsblk: lsblk.stdout.trim(),
    hostProcNames: hostProcNames.stdout.trim(),
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

async function executeRescanPlan(
  manager: NonNullable<ReturnType<typeof getActiveSSHManager>>,
  plan: RescanStep[],
): Promise<Array<{ key: RescanStep['key']; command: string; scannedHosts: string[] }>> {
  const executed: Array<{ key: RescanStep['key']; command: string; scannedHosts: string[] }> = []
  for (const step of plan) {
    await manager.exec(step.command, 15_000)
    executed.push({ key: step.key, command: step.command, scannedHosts: step.scannedHosts })
  }
  return executed
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
    const before = await captureRescanSnapshot(manager)
    const megaraidHosts = megaraidHostsFromProcNames(before.hostProcNames)
    const preferredHost = host ?? null
    const plan = buildRescanPlan({ preferredHost, megaraidHosts })
    // Keep compatibility command field with the first effective host scan.
    const command = preferredHost ? targetedScanCmd(preferredHost) : globalScanCmd()
    const executedSteps = await executeRescanPlan(manager, plan)
    const after = await captureRescanSnapshot(manager)
    const dmesgTail = await readDmesgTail(manager)
    invalidateCacheKey(`raid-overview-${sanId}`)
    invalidateCacheKey(`lvm-overview-${sanId}`)
    invalidateCacheKey(`fs-overview-${sanId}`)
    const afterOverview = await collectRaidOverview(manager)
    const afterCtrl = targetCtrl ? afterOverview.hardwareControllers.find(c => c.id === targetCtrl.id) : undefined
    const afterLd = targetLd && afterCtrl ? afterCtrl.logicalDrives.find(ld => ld.id === targetLd.id) : undefined
    const mappedPath = afterLd ? hwLdOsPath(afterLd) : null
    const outcome = buildRescanOutcome(mappedPath)
    const newLsscsiEntries = diffLines(before.lsscsiG || before.lsscsi, after.lsscsiG || after.lsscsi)
    const newLsblkEntries = diffLines(before.lsblk, after.lsblk)
    const manualCommands = [
      ...executedSteps.map(s => s.command),
      'lsscsi -g',
      'lsblk -J -O',
      'dmesg | tail -n 80',
    ]
    return {
      ok: true,
      command,
      host: host ?? null,
      foundNewDevice: outcome.foundNewDevice,
      mappedPath,
      suggestReboot: outcome.suggestReboot,
      resultMessage: outcome.resultMessage,
      diagnostics: {
        vdId: afterLd?.id ?? body?.vdId ?? null,
        controllerId: afterCtrl?.id ?? body?.controllerId ?? null,
        expectedSizeBytes: afterLd?.sizeBytes ?? targetLd?.sizeBytes ?? null,
        hostsProcNames: before.hostProcNames,
        megaraidHosts,
        stepsExecuted: executedSteps,
        perccliBefore: before.perccli,
        perccliAfter: after.perccli,
        lsscsiGBefore: before.lsscsiG,
        lsscsiGAfter: after.lsscsiG,
        lsscsiBefore: before.lsscsi,
        lsscsiAfter: after.lsscsi,
        lsblkBefore: before.lsblk,
        lsblkAfter: after.lsblk,
        newLsscsiEntries,
        newLsblkEntries,
        dmesgTail,
        manualCommands,
      },
    }
  })
})
