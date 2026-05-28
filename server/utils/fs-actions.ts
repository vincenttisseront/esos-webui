import { createError } from 'h3'
import {
  buildCreateFilesystemCommands,
  buildCreateVdiskCommands,
  buildFstabLine,
  buildRemoveVdiskCommand,
  buildUnmountCommand,
  buildVdiskPath,
  mkfsDevicePath,
} from '~/utils/fs-command-builder'
import { shellSingleQuoteForRemote } from './remote-config-paths'
import { appendFstabLine } from './fs-fstab-writer'
import { createDevice } from './scst-config-writer'
import type { CreateFileioPayload, CreateFsPayload, CreateVdiskPayload } from '~/types/filesystem'
import type { SSHSessionManager } from './ssh-session-manager'

async function execCmds(manager: SSHSessionManager, commands: string[], timeoutMs = 120_000): Promise<void> {
  for (const cmd of commands) {
    const r = await manager.exec(cmd, timeoutMs)
    if (r.code !== 0) {
      throw createError({
        statusCode: 422,
        statusMessage: r.stderr.trim() || r.stdout.trim() || `Échec: ${cmd}`,
      })
    }
  }
}

export async function runCreateFilesystem(
  manager: SSHSessionManager,
  payload: CreateFsPayload,
): Promise<{ mountPoint: string; uuid?: string }> {
  const partitionStrategy = payload.partitionStrategy ?? 'none'
  const cmds = buildCreateFilesystemCommands({
    backendPath: payload.backendPath,
    fsType: payload.fsType,
    label: payload.label,
    mountPoint: payload.mountPoint,
    partitionStrategy,
    wipeBeforeFormat: Boolean(payload.allowWipeSignatures),
  }).filter(c => !c.includes('blkid -o export'))

  const mkfsTarget = mkfsDevicePath(payload.backendPath, partitionStrategy)
  const mountCmd = cmds.pop()
  await execCmds(manager, cmds)

  const qDev = shellSingleQuoteForRemote(mkfsTarget)
  const blkid = await manager.exec(`blkid -o value -s UUID ${qDev}`, 15_000)
  const uuid = blkid.stdout.trim()

  if (uuid) {
    const line = buildFstabLine(uuid, payload.mountPoint, payload.fsType)
    await appendFstabLine(manager, line)
  }

  if (mountCmd) await execCmds(manager, [mountCmd])

  return { mountPoint: payload.mountPoint, uuid: uuid || undefined }
}

export async function runCreateVdisk(
  manager: SSHSessionManager,
  payload: CreateVdiskPayload,
): Promise<{ path: string }> {
  const fullPath = buildVdiskPath(payload.mountPoint, payload.fileName)
  const allocMode = payload.allocMode ?? 'fallocate'
  await execCmds(manager, buildCreateVdiskCommands(fullPath, payload.sizeBytes, allocMode), 300_000)
  return { path: fullPath }
}

export async function runBindFileio(payload: CreateFileioPayload): Promise<{ deviceName: string }> {
  const attrs: Record<string, string> = {}
  if (payload.nvCache !== false) attrs.nv_cache = '1'
  await createDevice('vdisk_fileio', payload.deviceName, payload.vdiskPath, attrs)
  return { deviceName: payload.deviceName }
}

export async function runDeleteVdisk(manager: SSHSessionManager, path: string): Promise<void> {
  await execCmds(manager, [buildRemoveVdiskCommand(path)])
}

export async function runUnmountFs(manager: SSHSessionManager, mountPoint: string): Promise<void> {
  await execCmds(manager, [buildUnmountCommand(mountPoint)])
}
