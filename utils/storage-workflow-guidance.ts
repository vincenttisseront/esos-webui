import type { FsBackendRef } from '~/types/filesystem'
import type { LogicalVolume } from '~/types/lvm'
import {
  buildBackendEligibilityView,
  hasEligibleFileioBackend,
  reasonCodes,
} from '~/utils/fs-backend-eligibility'
import { FS_BACKEND_REASON } from '~/utils/fs-backend-reasons'
import { isBlockProvisioningComplete } from '~/utils/lvm-lv-usage'

export interface BlockioBoundLvRow {
  path: string
  displayName: string
  scstDevices: string[]
}

export interface FileioBackendSituation {
  /** All LVM LV backends in use by SCST BLOCKIO; no FILEIO-eligible path. */
  blockioOnlyGap: boolean
  blockProvisioningComplete: boolean
  fileioTrackConfigured: boolean
  blockioBoundLvs: BlockioBoundLvRow[]
  suggestedLvName: string
  suggestedVgName: string | null
}

function lvForBackendPath(path: string, lvs: LogicalVolume[]): LogicalVolume | undefined {
  return lvs.find(lv =>
    lv.path === path
    || lv.pathCandidates?.includes(path)
    || path.includes(`/${lv.vgName}/${lv.name}`),
  )
}

export function listBlockioBoundLvs(
  backends: FsBackendRef[],
  lvs: LogicalVolume[],
): BlockioBoundLvRow[] {
  const rows: BlockioBoundLvRow[] = []
  const seen = new Set<string>()
  for (const b of backends) {
    if (b.kind !== 'lvm_lv') continue
    const codes = reasonCodes(b)
    if (!codes.includes(FS_BACKEND_REASON.SCST_BLOCKIO)) continue
    const lv = lvForBackendPath(b.path, lvs)
    const path = b.path
    if (seen.has(path)) continue
    seen.add(path)
    rows.push({
      path,
      displayName: lv?.displayName ?? b.displayName ?? path,
      scstDevices: lv?.scstDeviceNames ?? lv?.scst?.deviceNames ?? b.scstDeviceNames ?? [],
    })
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}

export function pickSuggestedFileioVg(lvs: LogicalVolume[], vgs: { name: string; freeBytes: number; clustered?: boolean }[]): string | null {
  const fromLvs = [...new Set(lvs.map(lv => lv.vgName).filter(Boolean))]
  if (fromLvs.length === 1) return fromLvs[0]!
  const withSpace = vgs.filter(v => !v.clustered && v.freeBytes > 0)
  if (withSpace.length) {
    return withSpace.reduce((best, v) => (v.freeBytes > best.freeBytes ? v : best), withSpace[0]).name
  }
  return fromLvs[0] ?? vgs[0]?.name ?? null
}

export function analyzeFileioBackendSituation(input: {
  backends: FsBackendRef[]
  lvs: LogicalVolume[]
  vgs: { name: string; freeBytes: number; clustered?: boolean }[]
  fileioTrackConfigured: boolean
}): FileioBackendSituation {
  const blockioBoundLvs = listBlockioBoundLvs(input.backends, input.lvs)
  const lvBackends = input.backends.filter(b => b.kind === 'lvm_lv')
  const allLvBlockio = lvBackends.length > 0
    && lvBackends.every(b => reasonCodes(b).includes(FS_BACKEND_REASON.SCST_BLOCKIO))
  const blockProvisioningComplete = isBlockProvisioningComplete(input.lvs)
  const blockioOnlyGap = !hasEligibleFileioBackend(input.backends)
    && allLvBlockio
    && blockProvisioningComplete
    && blockioBoundLvs.length > 0

  return {
    blockioOnlyGap,
    blockProvisioningComplete,
    fileioTrackConfigured: input.fileioTrackConfigured,
    blockioBoundLvs,
    suggestedLvName: 'fileio_store',
    suggestedVgName: pickSuggestedFileioVg(input.lvs, input.vgs),
  }
}

export function fileioEligibleBackendPaths(backends: FsBackendRef[]): string[] {
  return backends.filter(b => b.eligible).map(b => b.path)
}

export function formatBlockioLvArrow(row: BlockioBoundLvRow): string {
  const dev = row.scstDevices.length ? row.scstDevices.join(', ') : '—'
  return `${row.path} → ${row.displayName}${dev !== '—' ? ` (${dev})` : ''}`
}

/** User-facing summary for a backend row (reinforces BLOCKIO vs FILEIO). */
export function backendWorkflowHint(backend: FsBackendRef): string | null {
  const view = buildBackendEligibilityView(backend)
  if (view.statusGroup === 'in_use' && reasonCodes(backend).includes(FS_BACKEND_REASON.SCST_BLOCKIO)) {
    return 'storage.fs.backend.summary.scst_blockio'
  }
  return null
}
