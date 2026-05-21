import { parseScstConfSafe } from './scst-conf-parser'
import type { ScstSysfsFileioEntry } from '~/utils/fs-scst-inventory'
import type { SSHSessionManager } from './ssh-session-manager'

export type ScstDeviceIndex = {
  names: Set<string>
  pathToDevices: Map<string, string[]>
}

function scstConfPath(): string {
  return process.env.SCST_CONF_PATH || '/etc/scst.conf'
}

function scstSysfsPath(): string {
  return process.env.SCST_SYSFS_PATH || '/sys/kernel/scst_tgt'
}

function addDevice(
  names: Set<string>,
  pathToDevices: Map<string, string[]>,
  name: string,
  filename?: string,
): void {
  names.add(name)
  const fn = filename?.trim()
  if (!fn) return
  const list = pathToDevices.get(fn) ?? []
  if (!list.includes(name)) list.push(name)
  pathToDevices.set(fn, list)
}

/**
 * SCST device index from static config (scst.conf) and runtime sysfs
 * (/sys/kernel/scst_tgt/devices/).
 */
export async function readScstDeviceIndex(manager: SSHSessionManager): Promise<ScstDeviceIndex> {
  const names = new Set<string>()
  const pathToDevices = new Map<string, string[]>()

  const confResult = await manager.exec(`cat '${scstConfPath()}' 2>/dev/null || true`, 15_000)
  const config = parseScstConfSafe(confResult.stdout)
  for (const h of config.handlers) {
    for (const d of h.devices) {
      addDevice(names, pathToDevices, d.name, d.filename)
    }
  }

  const sysfsBase = scstSysfsPath()
  const sysfsResult = await manager.exec(
    [
      `for d in ${sysfsBase}/devices/*/; do`,
      '[ -d "$d" ] || continue;',
      'name=$(basename "$d");',
      'fn=$(cat "$d/filename" 2>/dev/null || true);',
      'echo "$name|$fn";',
      'done',
    ].join(' '),
    15_000,
  )
  for (const line of sysfsResult.stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const sep = trimmed.indexOf('|')
    const name = sep >= 0 ? trimmed.slice(0, sep) : trimmed
    const fn = sep >= 0 ? trimmed.slice(sep + 1) : ''
    if (name) addDevice(names, pathToDevices, name, fn)
  }

  return { names, pathToDevices }
}

/** FILEIO devices from sysfs with filename and common attrs. */
export async function readScstSysfsFileioMap(manager: SSHSessionManager): Promise<Map<string, ScstSysfsFileioEntry>> {
  const map = new Map<string, ScstSysfsFileioEntry>()
  const sysfsBase = scstSysfsPath()
  const r = await manager.exec(
    [
      `for d in ${sysfsBase}/devices/*/; do`,
      '[ -d "$d" ] || continue;',
      'name=$(basename "$d");',
      'handler=$(cat "$d/handler" 2>/dev/null || true);',
      'fn=$(cat "$d/filename" 2>/dev/null || true);',
      'nv=$(cat "$d/nv_cache" 2>/dev/null || true);',
      'echo "$name|$handler|$fn|$nv";',
      'done',
    ].join(' '),
    15_000,
  )
  for (const line of r.stdout.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const parts = t.split('|')
    const name = parts[0] ?? ''
    const handler = parts[1] ?? ''
    const filename = parts[2] ?? ''
    const nv = parts[3] ?? ''
    if (!name || handler !== 'vdisk_fileio') continue
    const attrs: Record<string, string> = {}
    if (nv) attrs.nv_cache = nv
    map.set(name, { name, filename: filename.trim(), attrs })
  }
  return map
}
