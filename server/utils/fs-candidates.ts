import { collectFsOverview } from './fs-overview.service'
import type { FsBackendCandidate } from '~/types/filesystem'
import type { SSHSessionManager } from './ssh-session-manager'

/** @deprecated Prefer backends from collectFsOverview / GET /api/fs/overview */
export async function collectFsBackendCandidates(
  manager: SSHSessionManager,
  _options?: { allowRawDisk?: boolean },
): Promise<FsBackendCandidate[]> {
  const overview = await collectFsOverview(manager)
  return overview.backends.map(b => ({
    path: b.path,
    kind: b.kind,
    sizeBytes: b.sizeBytes,
    eligible: b.eligible,
    reasons: b.reasons,
    displayName: b.displayName,
  }))
}
