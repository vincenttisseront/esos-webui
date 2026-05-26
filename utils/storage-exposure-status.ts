import type { FsBackendRef, FsOverview, ScstLunMappingRef } from '~/types/filesystem'
import type { LogicalVolume } from '~/types/lvm'
import type { ProvisioningStepView } from '~/utils/lvm-provisioning-chain'
import { fileioRelevantMounts } from '~/utils/fs-mount-classifier'
import { hasEligibleFileioBackend, reasonCodes } from '~/utils/fs-backend-eligibility'
import { FS_BACKEND_REASON } from '~/utils/fs-backend-reasons'
import { lvCanBindScst } from '~/utils/lvm-action-availability'

export interface BlockioBoundLvRow {
  path: string
  displayName: string
  scstDevices: string[]
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

export function pickSuggestedFileioVg(
  lvs: LogicalVolume[],
  vgs: { name: string; freeBytes: number; clustered?: boolean }[],
): string | null {
  const fromLvs = [...new Set(lvs.map(lv => lv.vgName).filter(Boolean))]
  if (fromLvs.length === 1) return fromLvs[0]!
  const withSpace = vgs.filter(v => !v.clustered && v.freeBytes > 0)
  if (withSpace.length) {
    return withSpace.reduce((best, v) => (v.freeBytes > best.freeBytes ? v : best), withSpace[0]).name
  }
  return fromLvs[0] ?? vgs[0]?.name ?? null
}

export type ExposureTrackMode = 'none' | 'in_progress' | 'operational' | 'optional'

export interface ExposureTrackStatus {
  mode: ExposureTrackMode
  labelKey: string
  complete: boolean
  started: boolean
}

export interface BlockioStatus extends ExposureTrackStatus {
  boundLvs: BlockioBoundLvRow[]
  unmappedDeviceCount: number
}

export interface FileioStatus extends ExposureTrackStatus {
  hasEligibleBackend: boolean
  chainIncomplete: boolean
}

export type ExposureHealthIssueCode =
  | 'blockio_path_incomplete'
  | 'fileio_path_incomplete'
  | 'backend_double_use'
  | 'fileio_unmapped_devices'
  | 'cluster_symmetry'

export interface ExposureHealthIssue {
  code: ExposureHealthIssueCode
  messageKey: string
  messageParams?: Record<string, string>
}

export interface ExposureSummary {
  blockio: BlockioStatus
  fileio: FileioStatus
  health: 'ok' | 'attention'
  issues: ExposureHealthIssue[]
  /** BLOCKIO is up; FILEIO not configured; no separate FILEIO backend. */
  blockioOperationalFileioOptional: boolean
  suggestedFileioLvName: string
  suggestedFileioVgName: string | null
}

export interface BuildExposureSummaryInput {
  backends: FsBackendRef[]
  lvs: LogicalVolume[]
  vgs: { name: string; freeBytes: number; clustered?: boolean }[]
  overview: FsOverview | null
  fileioChain: ProvisioningStepView[]
  clusterSymmetryBroken?: boolean
}

function blockioBoundPaths(backends: FsBackendRef[], lvs: LogicalVolume[]): Set<string> {
  const paths = new Set<string>()
  for (const row of listBlockioBoundLvs(backends, lvs)) paths.add(row.path)
  for (const lv of lvs) {
    const names = lv.scst?.deviceNames ?? lv.scstDeviceNames ?? []
    if (names.length || lv.usedBy.includes('scst')) paths.add(lv.path)
  }
  return paths
}

function pathsMatch(a: string, b: string): boolean {
  return a === b || a.endsWith(b) || b.endsWith(a)
}

export function detectBackendDoubleUse(input: {
  backends: FsBackendRef[]
  lvs: LogicalVolume[]
  overview: FsOverview | null
}): string[] {
  const blockPaths = blockioBoundPaths(input.backends, input.lvs)
  if (!blockPaths.size || !input.overview) return []

  const conflicts: string[] = []
  const mounts = fileioRelevantMounts(input.overview.mounts.filter(m => m.mounted))
  for (const m of mounts) {
    const backing = m.linkedBackendPath ?? m.backingDevice
    for (const bp of blockPaths) {
      if (pathsMatch(backing, bp)) conflicts.push(bp)
    }
  }

  return [...new Set(conflicts)]
}

export function isFileioBackendBlockedByBlockio(backend: FsBackendRef): boolean {
  return reasonCodes(backend).includes(FS_BACKEND_REASON.SCST_BLOCKIO)
}

function isBlockioTrackComplete(boundLvs: BlockioBoundLvRow[], lvs: LogicalVolume[]): boolean {
  if (!boundLvs.length) return false
  const boundPaths = new Set(boundLvs.map(b => b.path))
  return !lvs.some(lv => boundPaths.has(lv.path) && lvCanBindScst(lv))
}

function fileioTrackStarted(overview: FsOverview | null): boolean {
  if (!overview) return false
  return fileioRelevantMounts(overview.mounts.filter(m => m.mounted)).length > 0
    || overview.vdiskFiles.length > 0
    || overview.fileioDevices.length > 0
}

function fileioChainIncomplete(chain: ProvisioningStepView[], started: boolean): boolean {
  if (!started) return false
  return chain.some(s =>
    s.status === 'missing' || s.status === 'next' || s.status === 'blocked',
  )
}

export function buildBlockioStatus(input: {
  backends: FsBackendRef[]
  lvs: LogicalVolume[]
  luns?: ScstLunMappingRef[]
}): BlockioStatus {
  const boundLvs = listBlockioBoundLvs(input.backends, input.lvs)
  const started = boundLvs.length > 0 || input.lvs.some(lv => !lvCanBindScst(lv))
  const complete = isBlockioTrackComplete(boundLvs, input.lvs)
  const unmappedDeviceCount = 0

  let mode: ExposureTrackMode = 'none'
  let labelKey = 'storage.exposure.blockio.none'
  if (complete) {
    mode = 'operational'
    labelKey = 'storage.exposure.blockio.operational'
  } else if (started) {
    mode = 'in_progress'
    labelKey = 'storage.exposure.blockio.in_progress'
  }

  return {
    mode,
    labelKey,
    complete,
    started,
    boundLvs,
    unmappedDeviceCount,
  }
}

export function buildFileioStatus(input: {
  overview: FsOverview | null
  chain: ProvisioningStepView[]
  backends: FsBackendRef[]
  blockioOperational: boolean
}): FileioStatus {
  const started = fileioTrackStarted(input.overview)
  const chainIncomplete = fileioChainIncomplete(input.chain, started)
  const hasEligibleBackend = hasEligibleFileioBackend(input.backends)
  const chainComplete = started && !chainIncomplete
    && input.chain.every(s =>
      s.status === 'created' || s.status === 'ready' || s.status === 'optional',
    )

  let mode: ExposureTrackMode = 'none'
  let labelKey = 'storage.exposure.fileio.none'

  if (chainComplete) {
    mode = 'operational'
    labelKey = 'storage.exposure.fileio.operational'
  } else if (started) {
    mode = 'in_progress'
    labelKey = 'storage.exposure.fileio.in_progress'
  } else if (input.blockioOperational) {
    mode = 'optional'
    labelKey = 'storage.exposure.fileio.optional'
  }

  return {
    mode,
    labelKey,
    complete: chainComplete,
    started,
    hasEligibleBackend,
    chainIncomplete,
  }
}

export function collectExposureHealthIssues(input: BuildExposureSummaryInput & {
  blockio: BlockioStatus
  fileio: FileioStatus
}): ExposureHealthIssue[] {
  const issues: ExposureHealthIssue[] = []
  const overview = input.overview

  if (input.blockio.started && !input.blockio.complete) {
    issues.push({ code: 'blockio_path_incomplete', messageKey: 'storage.exposure.issue.blockio_incomplete' })
  }

  if (input.fileio.started && input.fileio.chainIncomplete) {
    issues.push({ code: 'fileio_path_incomplete', messageKey: 'storage.exposure.issue.fileio_incomplete' })
  }

  const doubleUse = detectBackendDoubleUse({
    backends: input.backends,
    lvs: input.lvs,
    overview,
  })
  if (doubleUse.length) {
    issues.push({
      code: 'backend_double_use',
      messageKey: 'storage.exposure.issue.backend_double_use',
      messageParams: { paths: doubleUse.join(', ') },
    })
  }

  if (overview) {
    const unmappedVdisk = overview.vdiskFiles.some(v => !v.mapped)
    const unmappedFileio = overview.fileioDevices.some(d => !d.mapped && d.filename)
    if (input.fileio.started && (unmappedVdisk || unmappedFileio)) {
      issues.push({ code: 'fileio_unmapped_devices', messageKey: 'storage.exposure.issue.fileio_unmapped' })
    }
  }

  if (input.clusterSymmetryBroken) {
    issues.push({ code: 'cluster_symmetry', messageKey: 'storage.exposure.issue.cluster_symmetry' })
  }

  return issues
}

export function buildExposureSummary(input: BuildExposureSummaryInput): ExposureSummary {
  const luns = input.overview?.lunMappings ?? []
  const blockio = buildBlockioStatus({
    backends: input.backends,
    lvs: input.lvs,
    luns,
  })
  const blockioOperational = blockio.mode === 'operational'
  const fileio = buildFileioStatus({
    overview: input.overview,
    chain: input.fileioChain,
    backends: input.backends,
    blockioOperational,
  })

  const issues = collectExposureHealthIssues({ ...input, blockio, fileio })

  const blockioOperationalFileioOptional = blockioOperational
    && fileio.mode !== 'operational'
    && !fileio.started
    && !fileio.hasEligibleBackend
    && blockio.boundLvs.length > 0

  const health: ExposureSummary['health'] = issues.length ? 'attention' : 'ok'

  return {
    blockio,
    fileio,
    health,
    issues,
    blockioOperationalFileioOptional,
    suggestedFileioLvName: 'fileio_store',
    suggestedFileioVgName: pickSuggestedFileioVg(input.lvs, input.vgs),
  }
}

/** @deprecated Use buildExposureSummary().blockioOperationalFileioOptional */