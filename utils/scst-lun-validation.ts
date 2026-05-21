import type { Lun, ScstConfig, Target } from '~/types/esos'

const DEVICE_NAME_RE = /^[A-Za-z0-9_\-]+$/
const LUN_ID_MIN = 0
const LUN_ID_MAX = 65535
const ALLOWED_HANDLERS = new Set(['vdisk_blockio', 'vdisk_fileio'])

export interface ValidateMapLunInput {
  lunId: number
  deviceName: string
  readOnly?: boolean
}

export interface ValidateMapLunContext {
  config: ScstConfig
  target: Target
  groupName: string
}

export interface ValidateLunResult {
  ok: boolean
  errorKey?: string
  message?: string
  previewLine?: string
}

export function expectedUnmapLunConfirmation(
  targetName: string,
  groupName: string,
  lunId: number,
): string {
  return `UNMAP LUN ${targetName}/${groupName}/${lunId}`
}

export function allLunsOnTarget(target: Target): Lun[] {
  return [...target.luns, ...target.groups.flatMap(g => g.luns)]
}

export function lunIdUsedOnTarget(target: Target, lunId: number, exceptGroup?: string): boolean {
  if (target.luns.some(l => l.id === lunId)) return true
  for (const g of target.groups) {
    if (exceptGroup && g.name === exceptGroup) continue
    if (g.luns.some(l => l.id === lunId)) return true
  }
  return false
}

export function deviceMappedOnTarget(target: Target, deviceName: string): boolean {
  return allLunsOnTarget(target).some(l => l.device === deviceName)
}

export function findDeviceInConfig(config: ScstConfig, deviceName: string) {
  for (const handler of config.handlers) {
    const device = handler.devices.find(d => d.name === deviceName)
    if (device) return { handler: handler.name, device }
  }
  return null
}

export function suggestNextLunId(groupLuns: Lun[]): number {
  if (groupLuns.length === 0) return 0
  return Math.max(...groupLuns.map(l => l.id)) + 1
}

export function buildLunPreviewLine(lunId: number, deviceName: string, readOnly?: boolean): string {
  if (readOnly) {
    return `LUN ${lunId} ${deviceName} {\n\tread_only 1\n}`
  }
  return `LUN ${lunId} ${deviceName}`
}

export function validateMapLun(
  input: ValidateMapLunInput,
  ctx: ValidateMapLunContext,
): ValidateLunResult {
  const { target, groupName, config } = ctx
  const group = target.groups.find(g => g.name === groupName)
  if (!group) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.group_not_found' }
  }

  const lunId = Number(input.lunId)
  if (!Number.isInteger(lunId) || lunId < LUN_ID_MIN || lunId > LUN_ID_MAX) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.lun_id_invalid' }
  }

  const deviceName = input.deviceName?.trim()
  if (!deviceName || !DEVICE_NAME_RE.test(deviceName)) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.device_name_invalid' }
  }

  const found = findDeviceInConfig(config, deviceName)
  if (!found) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.device_not_found' }
  }

  if (!ALLOWED_HANDLERS.has(found.handler)) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.handler_not_allowed' }
  }

  if (group.luns.some(l => l.id === lunId)) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.lun_id_duplicate_group' }
  }

  if (lunIdUsedOnTarget(target, lunId, groupName)) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.lun_id_duplicate_target' }
  }

  if (deviceMappedOnTarget(target, deviceName)) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.device_already_mapped' }
  }

  return {
    ok: true,
    previewLine: buildLunPreviewLine(lunId, deviceName, input.readOnly),
  }
}

export function validateUnmapLun(
  lunId: number,
  target: Target,
  groupName: string,
): ValidateLunResult {
  const group = target.groups.find(g => g.name === groupName)
  if (!group) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.group_not_found' }
  }
  const id = Number(lunId)
  if (!Number.isInteger(id)) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.lun_id_invalid' }
  }
  if (!group.luns.some(l => l.id === id)) {
    return { ok: false, errorKey: 'storage.hosts.luns.errors.lun_not_found' }
  }
  return { ok: true }
}
