import type { LvmCandidateDevice } from '~/types/lvm'
import { dedupeEligibilityReasons, formatIneligibleSummary } from '~/utils/block-device-display'

/** Human-readable label for a PV source candidate row (wizard + tables). */
export function formatLvmCandidateLabel(
  c: LvmCandidateDevice,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (c.kind === 'hw_raid_ld' && c.hwLdId) {
    const osPath = c.path.startsWith('hw:') ? '—' : c.path
    return t('lvm.candidate.label.hw_raid', {
      path: osPath,
      vdId: c.hwLdId,
      size: formatCandidateSize(c.sizeBytes),
    })
  }
  if (c.kind === 'md') {
    return t('lvm.candidate.label.md', { path: c.path, size: formatCandidateSize(c.sizeBytes) })
  }
  return `${c.path} (${formatCandidateSize(c.sizeBytes)})`
}

export function formatCandidateSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  const gb = bytes / (1024 ** 3)
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`
  const mb = bytes / (1024 ** 2)
  return `${mb.toFixed(0)} MB`
}

/** Provisioning chain source step detail (path + HW VD id + size). */
export function formatLvmSourceStepDetail(
  candidates: LvmCandidateDevice[],
  fallbackPath: string | null,
): string {
  if (!fallbackPath) return '—'
  const hit = candidates.find(c => c.path === fallbackPath)
  if (!hit) return fallbackPath
  if (hit.kind === 'hw_raid_ld' && hit.hwLdId) {
    return `${fallbackPath}, ${hit.hwLdId}, ${formatCandidateSize(hit.sizeBytes)}`
  }
  return `${fallbackPath}, ${formatCandidateSize(hit.sizeBytes)}`
}

const REASON_KEY_PATTERNS: Array<{ test: RegExp | string; key: string }> = [
  { test: 'storage.fs.hw_ld.mapping_not_found', key: 'lvm.candidate.reason.no_os_path' },
  { test: 'storage.fs.hw_ld.tool_missing', key: 'lvm.candidate.reason.no_os_path' },
  { test: /chemin OS non résolu/i, key: 'lvm.candidate.reason.no_os_path' },
  { test: /Volume système ESOS/i, key: 'lvm.candidate.reason.system_protected' },
  { test: /^Monté/i, key: 'lvm.candidate.reason.mounted' },
  { test: /Périphérique monté/i, key: 'lvm.candidate.reason.mounted' },
  { test: /volume physique LVM/i, key: 'lvm.candidate.reason.already_pv' },
  { test: /SCST/i, key: 'lvm.candidate.reason.scst' },
  { test: /no[_ ]signature|aucune signature|no signature/i, key: 'lvm.candidate.reason.no_signature' },
  { test: /Signature|fichiers|wipefs/i, key: 'lvm.candidate.reason.signature' },
  { test: /Disque brut/i, key: 'lvm.candidate.reason.raw_disk' },
]

export function resolveLvmCandidateReasonKey(reason: string): string {
  if (reason.startsWith('lvm.candidate.reason.')) return reason
  if (reason.startsWith('storage.')) return reason
  for (const { test, key } of REASON_KEY_PATTERNS) {
    if (typeof test === 'string' ? reason === test : test.test(reason)) return key
  }
  return reason
}

export function formatLvmCandidateReason(
  reason: string,
  t: (key: string) => string,
): string {
  const key = resolveLvmCandidateReasonKey(reason)
  if (key.startsWith('lvm.') || key.startsWith('storage.') || key.startsWith('raid.block_device.')) {
    try {
      return t(key)
    } catch {
      return reason
    }
  }
  return reason
}

/** Primary ineligible line for tables; full list available via tooltip helper. */
export function formatLvmCandidateEligibilitySummary(
  reasons: string[],
  t: (key: string, params?: Record<string, string>) => string,
): string {
  return formatIneligibleSummary(dedupeEligibilityReasons(reasons), t)
}

export function formatLvmCandidateEligibilityTooltip(
  reasons: string[],
  t: (key: string) => string,
): string {
  const deduped = dedupeEligibilityReasons(reasons)
  if (deduped.length <= 1) return ''
  return deduped.map(r => formatLvmCandidateReason(r, t)).join('\n')
}

/** PV / MD / HW RAID candidates for the LVM tab (excludes raw disks). */
export function listPvSourceCandidates(candidates: LvmCandidateDevice[]): LvmCandidateDevice[] {
  return candidates.filter(c => c.kind === 'md' || c.kind === 'hw_raid_ld')
}
