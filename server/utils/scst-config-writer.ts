import { getActiveSSHManager } from './ssh-runtime'
import { writeRemoteFileAtomicOrThrow } from './remote-file-writer'
import { shellSingleQuoteForRemote } from './remote-config-paths'
import { readScstConfig } from './scst-config-reader'
import type { ScstConfig, Target, Group } from '~/types/esos'
import { invalidateCacheKey } from './cache'

// ─── Path helpers ─────────────────────────────────────────────────────────────

function scstConfPath(): string {
  return process.env.SCST_CONF_PATH || '/etc/scst.conf'
}

// ─── IQN / identifier validation ─────────────────────────────────────────────

const IQN_RE = /^iqn\.\d{4}-\d{2}\.[a-zA-Z0-9.-]+:[a-zA-Z0-9._:-]*$/
const WWN_RE = /^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){7}$/

export type TargetDriver = 'iscsi' | 'qla2x00t' | string

export function validateTargetName(name: string, driver: TargetDriver): void {
  if (driver === 'iscsi') {
    if (!IQN_RE.test(name)) {
      throw new Error(
        `IQN invalide. Format attendu : iqn.YYYY-MM.reversed-domain:identifier`,
      )
    }
    return
  }
  if (driver === 'qla2x00t') {
    if (!WWN_RE.test(name)) {
      throw new Error(
        `WWN invalide. Format attendu : xx:xx:xx:xx:xx:xx:xx:xx`,
      )
    }
    return
  }
  // Other drivers: basic identifier safety
  if (!/^[A-Za-z0-9._:\-]+$/.test(name)) {
    throw new Error(`Nom de target invalide pour le driver ${driver}`)
  }
}

// ─── Config serialiser ────────────────────────────────────────────────────────

export function serializeScstConfig(config: ScstConfig): string {
  const lines: string[] = []

  for (const handler of config.handlers) {
    lines.push(`HANDLER ${handler.name} {`)
    for (const device of handler.devices) {
      lines.push(`\tDEVICE ${device.name} {`)
      if (device.filename) lines.push(`\t\tfilename ${device.filename}`)
      for (const [k, v] of Object.entries(device.attrs)) {
        lines.push(`\t\t${k} ${v}`)
      }
      lines.push(`\t}`)
    }
    lines.push(`}`)
    lines.push(``)
  }

  for (const driver of config.drivers) {
    lines.push(`TARGET_DRIVER ${driver.name} {`)
    if (!driver.enabled) lines.push(`\tenabled 0`)

    for (const target of driver.targets) {
      lines.push(`\tTARGET ${target.name} {`)
      if (target.hwTarget) lines.push(`\t\tHW_TARGET`)
      if (!target.enabled) lines.push(`\t\tenabled 0`)

      for (const [k, v] of Object.entries(target.attrs)) {
        lines.push(`\t\t${k} ${v}`)
      }

      for (const group of target.groups) {
        lines.push(`\t\tGROUP ${group.name} {`)
        for (const initiator of group.initiators) {
          lines.push(`\t\t\tINITIATOR ${initiator}`)
        }
        for (const lun of group.luns) {
          const suffix = lun.readOnly ? ' readonly=1' : ''
          lines.push(`\t\t\tLUN ${lun.id} ${lun.device}${suffix}`)
        }
        lines.push(`\t\t}`)
      }

      for (const lun of target.luns) {
        const suffix = lun.readOnly ? ' readonly=1' : ''
        lines.push(`\t\tLUN ${lun.id} ${lun.device}${suffix}`)
      }

      lines.push(`\t}`)
    }

    lines.push(`}`)
    lines.push(``)
  }

  return lines.join('\n')
}

// ─── SSH write + SCST reload ──────────────────────────────────────────────────

/**
 * Write `content` to scst.conf atomically (temp + mv) and reload SCST.
 * Payload is sent as base64 inside a quoted heredoc — never interpolated via printf.
 */
export async function writeAndReloadScst(content: string): Promise<void> {
  const ssh = getActiveSSHManager()
  const path = scstConfPath()
  const qPath = shellSingleQuoteForRemote(path)

  await writeRemoteFileAtomicOrThrow(ssh, path, content, {
    logTag: 'scst-config',
    errorPrefix: 'Écriture scst.conf',
  })

  const reloadCmd = [
    `if command -v scstadmin >/dev/null 2>&1; then`,
    `  scstadmin -force -noprompt -config ${qPath} 2>&1 || true`,
    `elif [ -x /etc/init.d/scst ]; then`,
    `  /etc/init.d/scst reload 2>&1 || true`,
    `fi`,
  ].join('\n')

  const result = await ssh.exec(reloadCmd, 60_000)
  if (result.stderr?.trim()) {
    console.warn('[scst-config] reload stderr', result.stderr.slice(0, 500))
  }
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`
    console.error('[scst-config] reload failed', detail)
    throw new Error(`Erreur lors du rechargement SCST : ${detail}`)
  }
  console.log('[scst-config] reload ok', path)

  invalidateCacheKey('overview')
}

// ─── High-level mutators ──────────────────────────────────────────────────────

export async function createTarget(
  driverName: TargetDriver,
  targetName: string,
): Promise<void> {
  validateTargetName(targetName, driverName)

  const config = await readScstConfig()

  let driver = config.drivers.find((d) => d.name === driverName)
  if (!driver) {
    driver = { name: driverName, enabled: true, targets: [] }
    config.drivers.push(driver)
  }

  if (driver.targets.some((t) => t.name === targetName)) {
    throw new Error(`La target "${targetName}" existe déjà`)
  }

  const newTarget: Target = {
    name: targetName,
    driver: driverName,
    enabled: true,
    hwTarget: false,
    attrs: {},
    groups: [],
    luns: [],
    sessions: [],
  }

  driver.targets.push(newTarget)
  const content = serializeScstConfig(config)
  await writeAndReloadScst(content)
}

export async function deleteTarget(targetName: string): Promise<void> {
  const config = await readScstConfig()

  let found = false
  for (const driver of config.drivers) {
    const idx = driver.targets.findIndex((t) => t.name === targetName)
    if (idx !== -1) {
      driver.targets.splice(idx, 1)
      found = true
      break
    }
  }

  if (!found) {
    throw new Error(`Target "${targetName}" introuvable`)
  }

  const content = serializeScstConfig(config)
  await writeAndReloadScst(content)
}

export async function setTargetEnabled(
  targetName: string,
  enabled: boolean,
): Promise<void> {
  const config = await readScstConfig()

  let found = false
  for (const driver of config.drivers) {
    const target = driver.targets.find((t) => t.name === targetName)
    if (target) {
      target.enabled = enabled
      found = true
      break
    }
  }

  if (!found) {
    throw new Error(`Target "${targetName}" introuvable`)
  }

  const content = serializeScstConfig(config)
  await writeAndReloadScst(content)
}

// ─── Group mutators ───────────────────────────────────────────────────────────

export async function createGroup(
  targetName: string,
  groupName: string,
): Promise<void> {
  if (!/^[A-Za-z0-9_.-]+$/.test(groupName)) {
    throw new Error(`Nom de groupe invalide : ${groupName}`)
  }

  const config = await readScstConfig()
  let found = false

  for (const driver of config.drivers) {
    const target = driver.targets.find((t) => t.name === targetName)
    if (target) {
      if (target.groups.some((g) => g.name === groupName)) {
        throw new Error(`Le groupe "${groupName}" existe déjà`)
      }
      const group: Group = { name: groupName, initiators: [], luns: [] }
      target.groups.push(group)
      found = true
      break
    }
  }

  if (!found) throw new Error(`Target "${targetName}" introuvable`)

  await writeAndReloadScst(serializeScstConfig(config))
}

export async function deleteGroup(
  targetName: string,
  groupName: string,
): Promise<void> {
  const config = await readScstConfig()
  let found = false

  for (const driver of config.drivers) {
    const target = driver.targets.find((t) => t.name === targetName)
    if (target) {
      const idx = target.groups.findIndex((g) => g.name === groupName)
      if (idx !== -1) {
        target.groups.splice(idx, 1)
        found = true
      }
      break
    }
  }

  if (!found) throw new Error(`Groupe "${groupName}" introuvable`)
  await writeAndReloadScst(serializeScstConfig(config))
}

// ─── Device mutators ──────────────────────────────────────────────────────────

export async function createDevice(
  handlerName: string,
  deviceName: string,
  filename: string,
  attrs: Record<string, string> = {},
): Promise<void> {
  if (!/^[A-Za-z0-9_\-]+$/.test(deviceName)) {
    throw new Error('Nom de device invalide (lettres, chiffres, _ et - uniquement)')
  }
  if (handlerName !== 'nullio' && !filename.trim()) {
    throw new Error('Le chemin du fichier/périphérique est requis')
  }

  const config = await readScstConfig()

  let handler = config.handlers.find((h) => h.name === handlerName)
  if (!handler) {
    handler = { name: handlerName, devices: [] }
    config.handlers.push(handler)
  }

  if (handler.devices.some((d) => d.name === deviceName)) {
    throw new Error(`Le device "${deviceName}" existe déjà`)
  }

  handler.devices.push({
    name: deviceName,
    handler: handlerName,
    filename: filename.trim(),
    attrs,
  })

  await writeAndReloadScst(serializeScstConfig(config))
}

export async function deleteDevice(deviceName: string): Promise<void> {
  const config = await readScstConfig()

  // Refuse if device is referenced by any LUN
  const lunCount = config.drivers
    .flatMap((d) => d.targets)
    .flatMap((t) => [...t.luns, ...t.groups.flatMap((g) => g.luns)])
    .filter((l) => l.device === deviceName).length

  if (lunCount > 0) {
    throw new Error(
      `Le device "${deviceName}" est utilisé par ${lunCount} LUN(s) — retirez-le des groupes avant de le supprimer`,
    )
  }

  let found = false
  for (const handler of config.handlers) {
    const idx = handler.devices.findIndex((d) => d.name === deviceName)
    if (idx !== -1) {
      handler.devices.splice(idx, 1)
      if (handler.devices.length === 0) {
        config.handlers.splice(config.handlers.indexOf(handler), 1)
      }
      found = true
      break
    }
  }

  if (!found) throw new Error(`Device "${deviceName}" introuvable`)
  await writeAndReloadScst(serializeScstConfig(config))
}
