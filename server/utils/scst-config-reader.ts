import { getActiveSSHManager } from './ssh-runtime'
import { parseScstConfSafe } from './scst-conf-parser'
import { readAllSessions, readTargetsEnabled } from './sysfs-reader'
import { withCache } from './cache'
import { isSystemDriver } from '~/types/esos'
import type { ScstConfig, Overview, Device, Target } from '~/types/esos'

/**
 * Consolidated reader: combines the static configuration from scst.conf
 * with the dynamic state from sysfs (cf. SDD v1.2 rev.1 §9).
 */

function scstConfPath(): string {
  return process.env.SCST_CONF_PATH || '/etc/scst.conf'
}

const OVERVIEW_TTL_MS = 5_000

export async function readScstConfig(): Promise<ScstConfig> {
  const ssh = getActiveSSHManager()
  const path = scstConfPath()
  // `cat` returns empty if the file is missing; we tolerate that.
  const result = await ssh.exec(`cat '${path}' 2>/dev/null || true`)
  return parseScstConfSafe(result.stdout)
}

export async function readOverview(): Promise<Overview> {
  return withCache('overview', OVERVIEW_TTL_MS, buildOverview)
}

async function buildOverview(): Promise<Overview> {
  const config = await readScstConfig()

  // Split system drivers (copy_manager, …) from business drivers.
  const systemDrivers = config.drivers.filter((d) => isSystemDriver(d.name))
  const dataDrivers = config.drivers.filter((d) => !isSystemDriver(d.name))

  // Sessions: query only enabled, non-system drivers.
  const activeDriverNames = dataDrivers
    .filter((d) => d.enabled)
    .map((d) => d.name)

  const [sessions, ...enabledMaps] = await Promise.all([
    readAllSessions(activeDriverNames).catch(() => [] as Awaited<ReturnType<typeof readAllSessions>>),
    ...dataDrivers.map((driver) =>
      readTargetsEnabled(
        driver.name,
        driver.targets.map((t) => t.name),
      ).catch(() => new Map<string, boolean>()),
    ),
  ])

  // Enrich data-driver targets with live sysfs state.
  dataDrivers.forEach((driver, i) => {
    const enabledMap = enabledMaps[i] as Map<string, boolean>
    for (const target of driver.targets) {
      const live = enabledMap.get(target.name)
      if (live !== undefined) target.enabled = live
      target.sessions = sessions.filter(
        (s) => s.driver === driver.name && s.target === target.name,
      )
    }
  })

  const allTargets: Target[] = dataDrivers.flatMap((d) => d.targets)
  const sysTargets: Target[] = systemDrivers.flatMap((d) => d.targets)
  const devices: Device[] = config.handlers.flatMap((h) => h.devices)
  const allGroups = allTargets.flatMap((t) => t.groups)
  const groupLuns = allGroups.flatMap((g) => g.luns)
  const directLuns = allTargets.flatMap((t) => t.luns)

  return {
    stats: {
      targets: allTargets.length,
      devices: devices.length,
      sessions: sessions.length,
      groups: allGroups.length,
      luns: groupLuns.length + directLuns.length,
    },
    targets: allTargets,
    systemTargets: sysTargets,
    devices,
    sessions,
  }
}

export async function readTargetDetail(targetName: string): Promise<Target | null> {
  const config = await readScstConfig()

  const target = config.drivers
    .flatMap((d) => d.targets)
    .find((t) => t.name === targetName)

  if (!target) return null

  // Refresh live state for this single target + sessions for its driver.
  const [enabledMap, sessions] = await Promise.all([
    readTargetsEnabled(target.driver, [target.name]).catch(
      () => new Map<string, boolean>(),
    ),
    readAllSessions([target.driver]).catch(() => []),
  ])

  const live = enabledMap.get(target.name)
  if (live !== undefined) target.enabled = live
  target.sessions = sessions.filter((s) => s.target === targetName)
  return target
}
