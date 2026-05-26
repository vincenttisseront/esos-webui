import {
  buildCreateFilesystemCommands,
  buildCreateVdiskCommands,
  buildFstabLine,
  buildVdiskPath,
  mkfsDevicePath,
} from '~/utils/fs-command-builder'
import {
  expectedFormatFsConfirmation,
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
import { resolveFileioBindConflicts } from './fs-fileio-bind-conflicts'
import type { SSHSessionManager } from './ssh-session-manager'

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
  const blockers: string[] = []
  if (!cand) blockers.push('Backend introuvable')
  else if (!cand.eligible) blockers.push(...cand.reasons)

  const mountExists = overview.mounts.some(m => m.mountPoint === payload.mountPoint)
  if (mountExists) blockers.push('Point de montage déjà utilisé')

  const val = validateCreateFsInput({
    ...payload,
    partitionStrategy,
    blockers: blockers.map(b => b),
  })
  if (!val.ok) {
    return baseResult({
      blockers: val.blockers,
      requiredConfirmation: expectedFormatFsConfirmation(payload.backendPath),
    })
  }

  const cmds = buildCreateFilesystemCommands({
    backendPath: payload.backendPath,
    fsType: payload.fsType,
    label: payload.label,
    mountPoint: payload.mountPoint,
    partitionStrategy,
  })
  const mkfsTarget = mkfsDevicePath(payload.backendPath, partitionStrategy)
  const fstabPreview = `UUID=<uuid>  ${payload.mountPoint}  ${payload.fsType}  defaults  0  0`

  return {
    ok: blockers.length === 0,
    configPreview: [fstabPreview],
    commands: cmds,
    warnings: partitionStrategy === 'gpt' ? ['Partition GPT sera créée'] : [],
    blockers,
    requiredConfirmation: expectedFormatFsConfirmation(payload.backendPath),
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
  if (overview.vdiskFiles.some(v => v.path === fullPath)) {
    blockers.push('Fichier vdisk déjà présent')
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
  const blockers: string[] = []
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
  const blockers: string[] = []
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
