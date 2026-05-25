import type { Lun, Overview, Target } from '~/types/esos'
import type {
  ScstAccessControlOverview,
  ScstAccessGroupRef,
  ScstGroupLunRef,
  ScstTargetAccessRef,
} from '~/types/scst-hosts'
import { unmappedDevicesFromOverview } from '~/utils/scst-unmapped-devices'

function lunToRef(
  lun: Lun,
  deviceByName: Map<string, { handler: string; filename: string }>,
): ScstGroupLunRef {
  const dev = deviceByName.get(lun.device)
  return {
    lunId: lun.id,
    deviceName: lun.device,
    handler: dev?.handler ?? '',
    filename: dev?.filename ?? '',
    readOnly: lun.readOnly,
  }
}

function targetToAccessRef(
  target: Target,
  deviceByName: Map<string, { handler: string; filename: string }>,
): ScstTargetAccessRef {
  const groups: ScstAccessGroupRef[] = target.groups.map(g => ({
    name: g.name,
    initiators: [...g.initiators],
    luns: g.luns.map(l => lunToRef(l, deviceByName)),
  }))

  return {
    name: target.name,
    driver: target.driver,
    enabled: target.enabled,
    hwTarget: target.hwTarget,
    groups,
    targetLuns: target.luns.map(l => lunToRef(l, deviceByName)),
    sessionCount: target.sessions.length,
  }
}

/** Build normalized access-control view from full SCST overview. */
export function buildScstAccessControlFromOverview(
  overview: Overview,
  scannedAt = Date.now(),
): ScstAccessControlOverview {
  const deviceByName = new Map(
    overview.devices.map(d => [d.name, { handler: d.handler, filename: d.filename }]),
  )

  const targets = overview.targets
    .map(t => targetToAccessRef(t, deviceByName))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    scannedAt,
    targets,
    unmappedDevices: unmappedDevicesFromOverview(overview),
  }
}
