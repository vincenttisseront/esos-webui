import {
  buildCreateFilesystemCommands,
  buildCreateVdiskCommands,
  buildFstabLine,
  buildVdiskPath,
  mkfsDevicePath,
} from '~/utils/fs-command-builder'
import {
  expectedCreateFilesystemConfirmation,
  validateCreateFsInput,
  validateMountPoint,
  validateVdiskFileName,
  validateVdiskSize,
} from '~/utils/fs-preflight-validation'
import type {
  CreateFileioPayload,
  CreateFsPayload,
  CreateVdiskPayload,
  FsOverview,
  FsPreflightResult,
  PartitionStrategy,
} from '~/types/filesystem'
import type { FsBackendCandidate } from '~/types/filesystem'
import { collectFsBackendCandidates } from './fs-candidates'
import {
  mountPathStateBlockerKey,
  mountPathStateWarningKey,
  probeMountPathOnNode,
} from './fs-mount-path-preflight'
import { resolveFileioBindConflicts } from './fs-fileio-bind-conflicts'
import type { SSHSessionManager } from './ssh-session-manager'
import {
  esosProtectedFileBlocker,
  esosProtectedMountBlocker,
  esosProtectionDetectionFailedBlocker,
  isEsosProtectionDetectionFailed,
  isFilePathEsosProtected,
  isMountPointEsosProtected,
} from '../../utils/esos-resource-protection'

export type FsPreflightAction =
  | 'create_fs'
  | 'create_vdisk'
  | 'bind_fileio'
  | 'delete_vdisk'
  | 'unmount'

export interface FsPreflightRequest {
  action: FsPreflightAction
  payload: CreateFsPayload | CreateVdiskPayload | CreateFileioPayload | Record<string, string>
}

function esosBlockers(overview: FsOverview): string[] {
  const snap = overview.systemProtection
  if (!snap) return []
  if (isEsosProtectionDetectionFailed(snap)) {
    return [esosProtectionDetectionFailedBlocker()]
  }
  return []
}

function baseResult(partial?: Partial<FsPreflightResult>): FsPreflightResult {
  return {
    ok: false,
    configPreview: [],
    commands: [],
    warnings: [],
    blockers: [],
    ...partial,
  }
}

export async function runFsPreflight(
  manager: SSHSessionManager,
  overview: FsOverview,
  req: FsPreflightRequest,
  options?: { allowRawDisk?: boolean; sanId?: string },
): Promise<FsPreflightResult> {
  switch (req.action) {
    case 'create_fs':
      return preflightCreateFs(manager, overview, req.payload as CreateFsPayload, options)
    case 'create_vdisk':
      return preflightCreateVdisk(overview, req.payload as CreateVdiskPayload)
    case 'bind_fileio':
      return preflightBindFileio(manager, overview, req.payload as CreateFileioPayload, options?.sanId ?? '')
    case 'delete_vdisk':
      return preflightDeleteVdisk(overview, req.payload as { path: string })
    case 'unmount':
      return preflightUnmount(overview, req.payload as { mountPoint: string })
    default:
      return baseResult({ blockers: ['Action invalide'] })
  }
}

async function preflightCreateFs(
  manager: SSHSessionManager,
  overview: FsOverview,
  payload: CreateFsPayload,
  options?: { allowRawDisk?: boolean },
): Promise<FsPreflightResult> {
  const partitionStrategy: PartitionStrategy = payload.partitionStrategy ?? 'none'
  const candidates = await collectFsBackendCandidates(manager, options)
  const cand = candidates.find(c => c.path === payload.backendPath)
  const blockers: string[] = [...esosBlockers(overview)]
  if (overview.systemProtection && !isEsosProtectionDetectionFailed(overview.systemProtection)) {
    if (isMountPointEsosProtected(payload.mountPoint, overview.systemProtection)) {
      blockers.push(esosProtectedMountBlocker(payload.mountPoint))
    }
  }
  if (!cand) blockers.push('Backend introuvable')
  else if (cand.eligibility === 'blocked' || !cand.eligible) blockers.push(...cand.reasons)
  else if (cand.eligibility === 'eligible_with_wipe_required' && !payload.allowWipeSignatures) {
    blockers.push('storage.fs.wizard.create_fs.blocker_wipe_not_confirmed')
  }

  if (overview.mounts.some(m => m.mountPoint === payload.mountPoint && m.mounted)) {
    blockers.push('storage.fs.errors.mount_point_already_mounted')
  }

  let mountPathWarnings: string[] = []
  try {
    const remoteState = await probeMountPathOnNode(manager, payload.mountPoint)
    const remoteBlocker = mountPathStateBlockerKey(remoteState)
    if (remoteBlocker) blockers.push(remoteBlocker)
    else if (remoteState === 'empty_dir' && !payload.allowUseEmptyMountDir) {
      blockers.push('storage.fs.wizard.create_fs.blocker_empty_mount_not_confirmed')
    }
    const warnKey = mountPathStateWarningKey(remoteState)
    if (warnKey) mountPathWarnings = [warnKey]
  } catch {
    blockers.push('storage.fs.errors.mount_point_probe_failed')
  }

  const val = validateCreateFsInput({
    ...payload,
    partitionStrategy,
    blockers: blockers.map(b => b),
  })
  if (!val.ok) {
    return baseResult({
      blockers: val.blockers,
      requiredConfirmation: expectedCreateFilesystemConfirmation(payload.mountPoint),
    })
  }

  const cmds = buildCreateFilesystemCommands({
    backendPath: payload.backendPath,
    fsType: payload.fsType,
    label: payload.label,
    mountPoint: payload.mountPoint,
    partitionStrategy,
    wipeBeforeFormat: cand?.eligibility === 'eligible_with_wipe_required',
  })
  const mkfsTarget = mkfsDevicePath(payload.backendPath, partitionStrategy)
  const fstabPreview = `UUID=<uuid>  ${payload.mountPoint}  ${payload.fsType}  defaults  0  0`

  return {
    ok: blockers.length === 0,
    configPreview: [fstabPreview],
    commands: cmds,
    warnings: [
      ...mountPathWarnings,
      ...(partitionStrategy === 'gpt' ? ['storage.fs.wizard.create_fs.warn_gpt_partition'] : []),
      ...(cand?.eligibility === 'eligible_with_wipe_required'
        ? ['storage.fs.wizard.create_fs.warn_wipe_required']
        : []),
    ],
    blockers,
    requiredConfirmation: expectedCreateFilesystemConfirmation(payload.mountPoint),
  }
}

function preflightCreateVdisk(
  overview: FsOverview,
  payload: CreateVdiskPayload,
): FsPreflightResult {
  const blockers: string[] = []
  const mpErr = validateMountPoint(payload.mountPoint)
  if (mpErr) blockers.push(mpErr)
  const nameErr = validateVdiskFileName(payload.fileName)
  if (nameErr) blockers.push(nameErr)

  const mount = overview.mounts.find(m => m.mountPoint === payload.mountPoint)
  if (!mount) blockers.push('Filesystem non monté')
  else {
    const sizeErr = validateVdiskSize(payload.sizeBytes, mount.freeBytes)
    if (sizeErr) blockers.push(sizeErr)
  }

  const fullPath = buildVdiskPath(payload.mountPoint, payload.fileName)
  if (overview.systemProtection && !isEsosProtectionDetectionFailed(overview.systemProtection)) {
    if (isMountPointEsosProtected(payload.mountPoint, overview.systemProtection)) {
      blockers.push(esosProtectedMountBlocker(payload.mountPoint))
    }
    if (isFilePathEsosProtected(fullPath, overview.systemProtection)) {
      blockers.push(esosProtectedFileBlocker(fullPath))
    }
  }
  if (overview.vdiskFiles.some(v => v.path === fullPath)) {
    blockers.push('storage.fs.errors.vdisk_file_exists')
  }

  const allocMode = payload.allocMode ?? 'fallocate'
  if (allocMode === 'fallocate' && !overview.tools.fallocate) {
    blockers.push('fallocate indisponible')
  }

  return {
    ok: blockers.length === 0,
    configPreview: [fullPath],
    commands: buildCreateVdiskCommands(fullPath, payload.sizeBytes, allocMode),
    warnings: [],
    blockers,
    requiredConfirmation: `CREATE_VDISK ${fullPath}`,
  }
}

async function preflightBindFileio(
  manager: SSHSessionManager,
  overview: FsOverview,
  payload: CreateFileioPayload,
  sanId: string,
): Promise<FsPreflightResult> {
  const esos = esosBlockers(overview)
  if (esos.length) {
    return baseResult({ blockers: esos })
  }
  if (overview.systemProtection && isFilePathEsosProtected(payload.vdiskPath, overview.systemProtection)) {
    return baseResult({ blockers: [esosProtectedFileBlocker(payload.vdiskPath)] })
  }
  const conflict = await resolveFileioBindConflicts(manager, overview, payload, sanId)
  if (conflict) {
    return {
      ok: false,
      configPreview: [],
      commands: [],
      warnings: [],
      blockers: [conflict.message],
      conflict,
    }
  }

  const preview = [
    `HANDLER vdisk_fileio`,
    `DEVICE ${payload.deviceName.trim()}`,
    `filename ${payload.vdiskPath.trim()}`,
    payload.nvCache !== false ? 'nv_cache 1' : '',
  ].filter(Boolean)

  return {
    ok: true,
    configPreview: preview,
    commands: [`scst: create vdisk_fileio ${payload.deviceName.trim()}`],
    warnings: [],
    blockers: [],
    requiredConfirmation: `BIND_FILEIO ${payload.deviceName.trim()}`,
  }
}

function preflightDeleteVdisk(
  overview: FsOverview,
  payload: { path: string },
): FsPreflightResult {
  const blockers: string[] = [...esosBlockers(overview)]
  if (overview.systemProtection && isFilePathEsosProtected(payload.path, overview.systemProtection)) {
    blockers.push(esosProtectedFileBlocker(payload.path))
  }
  const vdisk = overview.vdiskFiles.find(v => v.path === payload.path)
  if (!vdisk) blockers.push('Fichier introuvable')
  else if (vdisk.mapped) blockers.push('Utilisé par SCST — supprimer le device d\'abord')

  return {
    ok: blockers.length === 0,
    configPreview: [],
    commands: [`rm -f ${payload.path}`],
    warnings: [],
    blockers,
    requiredConfirmation: `DELETE_VDISK ${payload.path}`,
  }
}

function preflightUnmount(
  overview: FsOverview,
  payload: { mountPoint: string },
): FsPreflightResult {
  const blockers: string[] = [...esosBlockers(overview)]
  if (overview.systemProtection && isMountPointEsosProtected(payload.mountPoint, overview.systemProtection)) {
    blockers.push(esosProtectedMountBlocker(payload.mountPoint))
  }
  const mount = overview.mounts.find(m => m.mountPoint === payload.mountPoint)
  if (!mount) blockers.push('Montage introuvable')

  const vdisks = overview.vdiskFiles.filter(v => v.mountPoint === payload.mountPoint)
  if (vdisks.length) blockers.push('Fichiers vdisk présents sous ce montage')
  const mapped = vdisks.filter(v => v.mapped)
  if (mapped.length) blockers.push('VDisk mappés SCST')

  return {
    ok: blockers.length === 0,
    configPreview: [],
    commands: [`umount ${payload.mountPoint}`],
    warnings: [],
    blockers,
    requiredConfirmation: `UNMOUNT ${payload.mountPoint}`,
  }
}
