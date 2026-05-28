import type { FsBackendCandidate, FsBackendRef } from '~/types/filesystem'
import type { EsosSystemProtectionOverview } from '~/utils/esos-system-protection'
import {
  isFilePathEsosProtected,
  isMountPointEsosProtected,
} from '~/utils/esos-resource-protection'
import { FS_BACKEND_REASON, normalizeBackendReason, parseMountedAtReason } from '~/utils/fs-backend-reasons'
import { formatCandidateSize } from '~/utils/lvm-candidate-display'
import { fsCreateWizardBackendStatus } from '~/utils/fs-wizard-filters'

export function shouldShowFsBackendSelect(eligibleBackends: FsBackendCandidate[]): boolean {
  return eligibleBackends.length > 1
}

export function mountPointFromFsLabel(label: string): string {
  const slug = label.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'fs01'
  return `/mnt/vdisks/${slug}`
}

/** Keep mount point in sync with label until the user edits mount point manually. */
export function syncMountPointFromLabel(
  label: string,
  currentMount: string,
  lastSuggestedMount: string,
): { mountPoint: string; lastSuggestedMount: string } | null {
  const suggested = mountPointFromFsLabel(label)
  if (currentMount.trim() !== lastSuggestedMount.trim()) return null
  return { mountPoint: suggested, lastSuggestedMount: suggested }
}

export function isFsBackendEsosProtected(
  backend: FsBackendCandidate,
  protection?: EsosSystemProtectionOverview | null,
): boolean {
  if (!protection) return false
  const ref = backend as FsBackendRef
  if (isFilePathEsosProtected(backend.path, protection)) return true
  if (ref.mountPoint && isMountPointEsosProtected(ref.mountPoint, protection)) return true
  return false
}

export function formatFsBackendSourceLine(backend: FsBackendRef): string {
  if (backend.kind === 'hw_raid_ld') {
    const ctrl = backend.controllerLabel?.trim()
    const vd = backend.hwLdId ?? backend.displayName ?? backend.path
    if (ctrl) return `${ctrl} / ${vd}`
  }
  if (backend.displayName?.trim()) return backend.displayName.trim()
  return backend.kind
}

export function formatFsBackendRaidLevel(backend: FsBackendRef): string | null {
  const level = backend.raidLevel?.trim()
  if (!level || level === 'unknown') return null
  return `RAID ${level}`
}

export function getFsBackendSignatureList(backend: FsBackendRef): string[] {
  const sigs = backend.signatures?.map(s => s.trim()).filter(Boolean) ?? []
  return [...new Set(sigs)]
}

export function buildFsSignatureSummary(backend: FsBackendRef): {
  devicePath: string
  signatures: string[]
  reasonKeys: string[]
} {
  const signatures = getFsBackendSignatureList(backend)
  const reasonKeys = backend.reasons
    .map(normalizeBackendReason)
    .filter(r => r === FS_BACKEND_REASON.FILESYSTEM_SIGNATURE || r.includes('signature'))
  return {
    devicePath: backend.path,
    signatures,
    reasonKeys: [...new Set(reasonKeys)],
  }
}

export function translateFsBackendReason(
  reason: string,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const normalized = normalizeBackendReason(reason)
  const mountedAt = parseMountedAtReason(normalized)
  if (mountedAt) return t(FS_BACKEND_REASON.MOUNTED_AT, { mount: mountedAt })
  if (normalized.startsWith('storage.')) return t(normalized)
  return reason
}

export function formatFsBackendSize(sizeBytes: number): string {
  return formatCandidateSize(sizeBytes)
}

export function fsCreateWizardNeedsWipe(backend: FsBackendCandidate | undefined): boolean {
  return fsCreateWizardBackendStatus(backend) === 'wipe_required'
}
