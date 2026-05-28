import type { RaidBlockDevice } from '~/types/raid'
import { normalizeBackendReason, parseMountedAtReason } from '~/utils/fs-backend-reasons'

export type BlockDeviceUsedByTag = RaidBlockDevice['usedBy'][number]

const FS_SIGNATURE_TYPES = new Set([
  'xfs', 'ext4', 'ext3', 'ext2', 'btrfs', 'vfat', 'fat32', 'ntfs', 'f2fs',
])

/** Stable unique strings, preserving first-seen order. */
export function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const v = raw.trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

export function parseMountedAtFromReason(reason: string): string | null {
  const normalized = normalizeBackendReason(reason)
  const fromKey = parseMountedAtReason(normalized)
  if (fromKey) return fromKey
  const fr = reason.match(/^Monté sur (.+)$/i)
  if (fr?.[1]) return fr[1].trim()
  const en = reason.match(/^Mounted on (.+)$/i)
  if (en?.[1]) return en[1].trim()
  return null
}

/** Unique mount paths from device field and eligibility reason strings. */
export function collectUniqueMountPoints(input: {
  mountpoint?: string
  reasons?: string[]
}): string[] {
  const mounts = new Set<string>()
  const mp = input.mountpoint?.trim()
  if (mp) mounts.add(mp)
  for (const reason of input.reasons ?? []) {
    const fromReason = parseMountedAtFromReason(reason)
    if (fromReason) mounts.add(fromReason)
  }
  return [...mounts].sort((a, b) => a.localeCompare(b))
}

/**
 * Drop redundant signature noise: if a concrete FS type is known, hide generic "filesystem".
 * Deduplicate exact signature strings.
 */
export function normalizeDeviceSignatures(input: {
  signatures?: string[]
  fstype?: string
}): string[] {
  const raw = dedupeStrings(input.signatures ?? [])
  const lower = raw.map(s => s.trim().toLowerCase())
  const fst = input.fstype?.trim().toLowerCase()
  const hasSpecificFs = lower.some(s => FS_SIGNATURE_TYPES.has(s))
    || (fst ? FS_SIGNATURE_TYPES.has(fst) : false)

  const filtered = raw.filter((sig, i) => {
    const l = lower[i]
    if (l === 'filesystem' && hasSpecificFs) return false
    if (fst && l === fst && lower.filter(x => x === fst).length > 1) return false
    return true
  })

  if (fst && FS_SIGNATURE_TYPES.has(fst) && !filtered.some(s => s.toLowerCase() === fst)) {
    return dedupeStrings([...filtered, fst])
  }
  return filtered
}

/** Deduplicate usedBy tags; drop generic tags when signatures carry the detail. */
export function dedupeUsedByTags(
  usedBy: BlockDeviceUsedByTag[],
  options?: { signatures?: string[]; fstype?: string; mountpoint?: string },
): BlockDeviceUsedByTag[] {
  let tags = dedupeStrings(usedBy) as BlockDeviceUsedByTag[]
  const sigs = normalizeDeviceSignatures({
    signatures: options?.signatures,
    fstype: options?.fstype,
  })

  if (sigs.length > 0 || options?.fstype) {
    tags = tags.filter(t => t !== 'filesystem' && t !== 'unknown_signature')
  } else {
    tags = tags.filter((t, idx, arr) => t !== 'unknown_signature' || arr.indexOf(t) === idx)
  }

  if (tags.includes('mounted')) {
    tags = tags.filter(t => t !== 'mounted')
  }

  return tags
}

export function buildDeviceDisplayTags(dev: RaidBlockDevice): {
  usedBy: BlockDeviceUsedByTag[]
  signatures: string[]
} {
  const signatures = normalizeDeviceSignatures({
    signatures: dev.diskSignatures ?? dev.wipefsSignatures,
    fstype: dev.fstype,
  })
  const usedBy = dedupeUsedByTags(dev.usedBy, {
    signatures,
    fstype: dev.fstype,
    mountpoint: dev.mountpoint,
  })
  return { usedBy, signatures }
}

const REASON_PRIORITY: Array<{ id: string; test: (reason: string) => boolean }> = [
  { id: 'esos_protected', test: r => /protégé|protected|ESOS/i.test(r) },
  { id: 'mounted', test: r => /monté|mounted/i.test(r) },
  { id: 'hardware_raid', test: r => /RAID matériel|hardware.?raid|Volume déjà en RAID/i.test(r) },
  { id: 'scst', test: r => /SCST/i.test(r) },
  { id: 'lvm', test: r => /LVM|volume physique/i.test(r) },
  { id: 'md', test: r => /\bMD\b|membre MD|superblock MD/i.test(r) },
  { id: 'signature', test: r => /signature|fichiers|filesystem|wipefs/i.test(r) },
  { id: 'partition', test: r => /partition|Seules les partitions/i.test(r) },
]

function reasonDedupeKey(reason: string): string {
  const mount = parseMountedAtFromReason(reason)
  if (mount) return `mounted:${mount}`
  const normalized = normalizeBackendReason(reason)
  if (normalized.startsWith('storage.')) return normalized
  for (const { id, test } of REASON_PRIORITY) {
    if (test(reason)) return id
  }
  return reason.trim().toLowerCase()
}

export function dedupeEligibilityReasons(reasons: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of reasons) {
    const key = reasonDedupeKey(r)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

const FRENCH_REASON_KEYS: Array<{ test: (r: string) => boolean; key: string }> = [
  { test: r => r === 'Seules les partitions existantes sont éligibles', key: 'raid.block_device.reason.partition' },
  { test: r => r === 'Type de partition Linux RAID Autodetect requis', key: 'raid.block_device.reason.partition' },
  { test: r => r === 'Système de fichiers détecté', key: 'raid.block_device.reason.signature' },
  { test: r => r === 'Signature existante non autorisée', key: 'raid.block_device.reason.signature' },
  { test: r => r === 'Signature ou système de fichiers détecté', key: 'raid.block_device.reason.signature' },
  { test: r => r === 'Périphérique monté', key: 'raid.block_device.reason.mounted' },
  { test: r => r.startsWith('Volume déjà en RAID matériel'), key: 'raid.block_device.reason.hardware_raid' },
  { test: r => r === 'PV LVM détecté', key: 'raid.block_device.reason.lvm' },
  { test: r => r === 'Utilisé par SCST', key: 'raid.block_device.reason.scst' },
]

export function resolveEligibilityReasonKey(reason: string): string {
  if (reason.startsWith('raid.block_device.reason.')) return reason
  if (reason.startsWith('storage.') || reason.startsWith('lvm.')) return reason

  const mount = parseMountedAtFromReason(reason)
  if (mount) return 'raid.block_device.reason.mounted_at'

  for (const { test, key } of FRENCH_REASON_KEYS) {
    if (test(reason)) return key
  }

  for (const { id, test } of REASON_PRIORITY) {
    if (test(reason)) return `raid.block_device.reason.${id}`
  }
  return 'raid.block_device.reason.other'
}

export function formatEligibilityReason(
  reason: string,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const key = resolveEligibilityReasonKey(reason)
  const mount = parseMountedAtFromReason(reason)
  if (key === 'raid.block_device.reason.mounted_at' && mount) {
    return t(key, { mount })
  }
  if (key.startsWith('raid.block_device.') || key.startsWith('storage.') || key.startsWith('lvm.')) {
    try {
      return t(key)
    } catch {
      return reason
    }
  }
  return reason
}

export function pickPrimaryEligibilityReason(
  reasons: string[],
  t: (key: string, params?: Record<string, string>) => string,
): { primary: string; all: string[]; moreCount: number } {
  const deduped = dedupeEligibilityReasons(reasons)
  const all = deduped.map(r => formatEligibilityReason(r, t))

  let primaryRaw = deduped[0] ?? ''
  for (const { test } of REASON_PRIORITY) {
    const hit = deduped.find(test)
    if (hit) {
      primaryRaw = hit
      break
    }
  }

  const primary = primaryRaw
    ? formatEligibilityReason(primaryRaw, t)
    : ''
  return {
    primary,
    all,
    moreCount: Math.max(0, all.length - 1),
  }
}

export function formatIneligibleSummary(
  reasons: string[],
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const { primary, moreCount } = pickPrimaryEligibilityReason(reasons, t)
  if (!primary) return ''
  if (moreCount > 0) {
    return t('raid.block_device.eligibility.ineligible_with_more', {
      reason: primary,
      count: String(moreCount),
    })
  }
  return t('raid.block_device.eligibility.ineligible', { reason: primary })
}

export function translateUsedByTag(
  tag: string,
  t: (key: string) => string,
): string {
  const key = `raid.block_device.tag.${tag}`
  try {
    return t(key)
  } catch {
    return tag
  }
}

export function translateSignatureTag(
  signature: string,
  t: (key: string) => string,
): string {
  const normalized = signature.trim().toLowerCase()
  const key = `raid.block_device.signature.${normalized}`
  try {
    return t(key)
  } catch {
    return signature
  }
}

export interface BlockDeviceRowDisplay {
  tags: { usedBy: BlockDeviceUsedByTag[]; signatures: string[] }
  mounts: string[]
  mdEligibility: ReturnType<typeof pickPrimaryEligibilityReason>
  allReasons: string[]
}

export function buildBlockDeviceRowDisplay(
  dev: RaidBlockDevice,
  extraReasons: string[],
  t: (key: string, params?: Record<string, string>) => string,
): BlockDeviceRowDisplay {
  const tags = buildDeviceDisplayTags(dev)
  const mdReasons = dedupeStrings([
    ...(dev.mdEligibilityReasons ?? []),
    ...extraReasons,
  ])
  const mounts = collectUniqueMountPoints({
    mountpoint: dev.mountpoint,
    reasons: mdReasons,
  })
  return {
    tags,
    mounts,
    mdEligibility: pickPrimaryEligibilityReason(mdReasons, t),
    allReasons: mdReasons,
  }
}
