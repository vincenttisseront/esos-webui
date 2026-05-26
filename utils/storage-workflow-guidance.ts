import type { FsBackendRef } from '~/types/filesystem'
import type { LogicalVolume } from '~/types/lvm'
import type { ProvisioningStepView } from '~/utils/lvm-provisioning-chain'
import type { FsOverview } from '~/types/filesystem'
import {
  buildBackendEligibilityView,
  reasonCodes,
} from '~/utils/fs-backend-eligibility'
import { FS_BACKEND_REASON } from '~/utils/fs-backend-reasons'
import {
  buildExposureSummary,
  listBlockioBoundLvs,
  pickSuggestedFileioVg,
  type BlockioBoundLvRow,
  type ExposureSummary,
} from '~/utils/storage-exposure-status'

export type { BlockioBoundLvRow, ExposureSummary } from '~/utils/storage-exposure-status'
export {
  buildExposureSummary,
  listBlockioBoundLvs,
  pickSuggestedFileioVg,
  detectBackendDoubleUse,
  isFileioBackendBlockedByBlockio,
} from '~/utils/storage-exposure-status'

export interface FileioBackendSituation {
  exposure: ExposureSummary
  /** @deprecated use exposure.blockioOperationalFileioOptional */
  blockioOnlyGap: boolean
  blockProvisioningComplete: boolean
  fileioTrackConfigured: boolean
  blockioBoundLvs: BlockioBoundLvRow[]
  suggestedLvName: string
  suggestedVgName: string | null
}

export function analyzeFileioBackendSituation(input: {
  backends: FsBackendRef[]
  lvs: LogicalVolume[]
  vgs: { name: string; freeBytes: number; clustered?: boolean }[]
  fileioTrackConfigured: boolean
  overview?: FsOverview | null
  fileioChain?: ProvisioningStepView[]
}): FileioBackendSituation {
  const exposure = buildExposureSummary({
    backends: input.backends,
    lvs: input.lvs,
    vgs: input.vgs,
    overview: input.overview ?? null,
    fileioChain: input.fileioChain ?? [],
  })

  return {
    exposure,
    blockioOnlyGap: exposure.blockioOperationalFileioOptional,
    blockProvisioningComplete: exposure.blockio.complete,
    fileioTrackConfigured: input.fileioTrackConfigured,
    blockioBoundLvs: exposure.blockio.boundLvs,
    suggestedLvName: exposure.suggestedFileioLvName,
    suggestedVgName: exposure.suggestedFileioVgName,
  }
}

export function fileioEligibleBackendPaths(backends: FsBackendRef[]): string[] {
  return backends.filter(b => b.eligible).map(b => b.path)
}

export function formatBlockioLvArrow(row: BlockioBoundLvRow): string {
  const dev = row.scstDevices.length ? row.scstDevices.join(', ') : '—'
  return `${row.path} → ${row.displayName}${dev !== '—' ? ` (${dev})` : ''}`
}

export function backendWorkflowHint(backend: FsBackendRef): string | null {
  const view = buildBackendEligibilityView(backend)
  if (view.statusGroup === 'in_use' && reasonCodes(backend).includes(FS_BACKEND_REASON.SCST_BLOCKIO)) {
    return 'storage.fs.backend.summary.scst_blockio'
  }
  return null
}
