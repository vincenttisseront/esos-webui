/**
 * SCST initiator / group validation (shared client + server).
 * ESOS wiki: FC WWPN, iSCSI IQN, IB GUID, pattern (* ? !).
 */

export type InitiatorType = 'fc' | 'iscsi' | 'ib' | 'pattern' | 'auto'

export const GROUP_NAME_RE = /^[A-Za-z0-9_.-]+$/

const IQN_RE = /^iqn\.\d{4}-\d{2}\.[a-zA-Z0-9.-]+:[a-zA-Z0-9._:-]*$/
const WWPN_RE = /^([0-9a-f]{2}:){7}[0-9a-f]{2}$/
const PATTERN_RE = /^[A-Za-z0-9.:*!?_-]+$/
const IB_GUID_COLONS_RE = /^[0-9a-f]{4}(:[0-9a-f]{4}){7}$/i
const IB_GUID_HEX_RE = /^0x[0-9a-f]+$/i

export interface ValidateInitiatorOptions {
  type?: InitiatorType
  /** When true, IB initiators use port GUID with colons; when false, 0x + hex without colons. */
  ibOneTargetPerPort?: boolean
}

export interface ValidateInitiatorResult {
  ok: boolean
  normalized?: string
  detectedType?: InitiatorType
  errorKey?: string
  message?: string
}

export function validateGroupName(name: string): ValidateInitiatorResult {
  const trimmed = name.trim()
  if (!trimmed) {
    return { ok: false, errorKey: 'storage.hosts.errors.group_name_required' }
  }
  if (!GROUP_NAME_RE.test(trimmed)) {
    return { ok: false, errorKey: 'storage.hosts.errors.group_name_invalid' }
  }
  return { ok: true, normalized: trimmed }
}

function detectInitiatorType(value: string): InitiatorType {
  const v = value.trim()
  if (v.includes('*') || v.includes('?') || v.includes('!')) return 'pattern'
  if (v.startsWith('iqn.')) return 'iscsi'
  if (v.startsWith('0x')) return 'ib'
  if (/^([0-9a-f]{2}:){7}[0-9a-f]{2}$/i.test(v)) return 'fc'
  if (IB_GUID_COLONS_RE.test(v)) return 'ib'
  return 'auto'
}

function normalizeFc(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeIscsi(value: string): string {
  return value.trim()
}

function normalizeIb(value: string, ibOneTargetPerPort: boolean): ValidateInitiatorResult {
  const v = value.trim()
  if (ibOneTargetPerPort) {
    const lower = v.toLowerCase()
    if (IB_GUID_COLONS_RE.test(lower)) {
      return { ok: true, normalized: lower, detectedType: 'ib' }
    }
    return { ok: false, errorKey: 'storage.hosts.errors.ib_guid_colons' }
  }
  if (IB_GUID_HEX_RE.test(v.toLowerCase())) {
    return { ok: true, normalized: v.toLowerCase(), detectedType: 'ib' }
  }
  const hex = v.replace(/:/g, '').toLowerCase()
  if (/^[0-9a-f]{32}$/.test(hex)) {
    return { ok: true, normalized: `0x${hex}`, detectedType: 'ib' }
  }
  return { ok: false, errorKey: 'storage.hosts.errors.ib_guid_hex' }
}

function normalizePattern(value: string): ValidateInitiatorResult {
  const v = value.trim()
  if (!PATTERN_RE.test(v)) {
    return { ok: false, errorKey: 'storage.hosts.errors.pattern_invalid' }
  }
  return { ok: true, normalized: v, detectedType: 'pattern' }
}

export function validateInitiatorValue(
  raw: string,
  options: ValidateInitiatorOptions = {},
): ValidateInitiatorResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, errorKey: 'storage.hosts.errors.initiator_required' }
  }

  const detected = detectInitiatorType(trimmed)
  const type: InitiatorType =
    !options.type || options.type === 'auto' ? detected : options.type

  const ibMode = options.ibOneTargetPerPort ?? true

  if (type === 'auto') {
    return { ok: false, errorKey: 'storage.hosts.errors.initiator_type_unknown' }
  }

  switch (type) {
    case 'pattern':
      return normalizePattern(trimmed)
    case 'fc': {
      const n = normalizeFc(trimmed)
      if (!WWPN_RE.test(n)) {
        return { ok: false, errorKey: 'storage.hosts.errors.fc_wwn_invalid' }
      }
      return { ok: true, normalized: n, detectedType: 'fc' }
    }
    case 'iscsi': {
      const n = normalizeIscsi(trimmed)
      if (!IQN_RE.test(n)) {
        return { ok: false, errorKey: 'storage.hosts.errors.iscsi_iqn_invalid' }
      }
      return { ok: true, normalized: n, detectedType: 'iscsi' }
    }
    case 'ib':
      return normalizeIb(trimmed, ibMode)
    default:
      return { ok: false, errorKey: 'storage.hosts.errors.initiator_type_unknown' }
  }
}

export function initiatorAlreadyOnTarget(
  groups: Array<{ name: string; initiators: string[] }>,
  initiator: string,
  exceptGroup?: string,
): boolean {
  const needle = initiator.trim().toLowerCase()
  for (const g of groups) {
    if (exceptGroup && g.name === exceptGroup) continue
    if (g.initiators.some(i => i.trim().toLowerCase() === needle)) return true
  }
  return false
}

export function expectedDeleteGroupConfirmation(targetName: string, groupName: string): string {
  return `DELETE GROUP ${targetName}/${groupName}`
}
