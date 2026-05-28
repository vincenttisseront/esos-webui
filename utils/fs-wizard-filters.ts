import type { FileSystemMount, FsBackendCandidate } from '~/types/filesystem'
import type { EsosSystemProtectionOverview } from '~/utils/esos-system-protection'
import {
  isFilePathEsosProtected,
  isMountPointEsosProtected,
} from '~/utils/esos-resource-protection'

export function mountsEligibleForVdisk(
  mounts: FileSystemMount[],
  protection?: EsosSystemProtectionOverview | null,
): FileSystemMount[] {
  return mounts.filter(m =>
    m.mounted
    && m.role !== 'system'
    && !isMountPointEsosProtected(m.mountPoint, protection),
  )
}

export function vdisksEligibleForFileio(
  vdisks: Array<{ path: string; mapped?: boolean }>,
  protection?: EsosSystemProtectionOverview | null,
): Array<{ path: string; mapped?: boolean }> {
  return vdisks.filter(v =>
    !v.mapped
    && !isFilePathEsosProtected(v.path, protection),
  )
}

export function backendsEligibleForCreateFs(
  backends: FsBackendCandidate[],
  protection?: EsosSystemProtectionOverview | null,
): FsBackendCandidate[] {
  if (!protection) return backends.filter(b => b.eligibility !== 'blocked' && b.eligible)
  return backends.filter(b =>
    b.eligibility !== 'blocked'
    && b.eligible
    && !isMountPointEsosProtected(b.mountPoint ?? '', protection),
  )
}

export type FsCreateWizardBackendStatus = 'available' | 'wipe_required' | 'blocked'

export function fsCreateWizardBackendStatus(backend: FsBackendCandidate | undefined): FsCreateWizardBackendStatus {
  if (!backend) return 'blocked'
  if (backend.eligibility === 'eligible_with_wipe_required') return 'wipe_required'
  if (backend.eligibility === 'eligible_clean' || backend.eligible) return 'available'
  return 'blocked'
}
