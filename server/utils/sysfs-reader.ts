import { getActiveSSHManager } from './ssh-runtime'
import type { Session } from '~/types/esos'

/**
 * Reads dynamic SCST state from `/sys/kernel/scst_tgt/` (cf. SDD v1.2 rev.1 §8).
 *
 * Multi-driver aware: in FC (qla2x00t) sessions have no `ip_addr`, the
 * initiator is identified by its WWN (basename of the session dir).
 *
 * The sysfs root is configurable via `SCST_SYSFS_PATH` to mitigate risk R3
 * (different paths across SCST versions).
 */

function sysfsRoot(): string {
  return process.env.SCST_SYSFS_PATH || '/sys/kernel/scst_tgt'
}

/** Whitelist driver/target identifiers to prevent shell injection. */
function safeIdent(value: string): string {
  if (!/^[A-Za-z0-9._:@/+\-]+$/.test(value)) {
    throw new Error(`Invalid identifier: ${value}`)
  }
  return value
}

/**
 * Reads every active session for the given drivers in a single SSH
 * round-trip. Output line format: `<driver>|<target>|<initiator>|<ip>|<sid>`.
 *
 * Default driver list covers the two transports we support (FC + iSCSI).
 */
export async function readAllSessions(
  drivers: string[] = ['qla2x00t', 'iscsi'],
): Promise<Session[]> {
  if (drivers.length === 0) return []

  const ssh = getActiveSSHManager()
  const root = sysfsRoot()

  const blocks = drivers.map((driver) => {
    const d = safeIdent(driver)
    return `
base="${root}/targets/${d}"
[ -d "$base" ] || true
for sess in "$base"/*/sessions/*/; do
  [ -d "$sess" ] || continue
  initiator=$(basename "$sess")
  target_dir=$(dirname "$(dirname "$sess")")
  target_name=$(basename "$target_dir")
  # ip_addr: direct file (FC) or first connection sub-dir (iSCSI)
  ip=$(cat "$sess/ip_addr" 2>/dev/null || cat "$sess"/conn_*/ip_addr 2>/dev/null | head -1 || echo "")
  sid=$(cat "$sess/sid" 2>/dev/null || echo "")
  echo "${d}|$target_name|$initiator|$ip|$sid"
done
`.trim()
  })

  const cmd = blocks.join('\n')
  const result = await ssh.exec(cmd)
  return parseSessionsLines(result.stdout)
}

function parseSessionsLines(raw: string): Session[] {
  const sessions: Session[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [driver, target, initiatorName, ipAddr, sid] = trimmed.split('|')
    if (driver && target && initiatorName) {
      sessions.push({
        driver,
        target,
        initiatorName,
        ipAddr: ipAddr ?? '',
        sid: sid ?? '',
      })
    }
  }
  return sessions
}

export async function readTargetEnabled(
  targetName: string,
  driver: string,
): Promise<boolean> {
  const ssh = getActiveSSHManager()
  const path = `${sysfsRoot()}/targets/${safeIdent(driver)}/${safeIdent(targetName)}/enabled`
  const result = await ssh.exec(`cat '${path}' 2>/dev/null || echo 0`)
  return result.stdout.trim() === '1'
}

/**
 * Reads the `enabled` flag for every target of a given driver in one SSH
 * command. Returns a map keyed by target name (missing → false).
 */
export async function readTargetsEnabled(
  driver: string,
  targetNames: string[],
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>()
  if (targetNames.length === 0) return map

  const ssh = getActiveSSHManager()
  const root = sysfsRoot()
  const d = safeIdent(driver)

  const cmd = targetNames
    .map((name) => {
      const safe = safeIdent(name)
      return `echo "${safe}=$(cat '${root}/targets/${d}/${safe}/enabled' 2>/dev/null || echo 0)"`
    })
    .join('; ')

  const result = await ssh.exec(cmd)
  for (const line of result.stdout.split('\n')) {
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const name = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (name) map.set(name, val === '1')
  }

  return map
}
