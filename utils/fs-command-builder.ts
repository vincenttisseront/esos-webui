import type { FsType, PartitionStrategy, VdiskAllocMode } from '~/types/filesystem'
import { shellSingleQuoteForRemote } from '~/server/utils/remote-config-paths'

export function mkfsDevicePath(backendPath: string, partitionStrategy: PartitionStrategy): string {
  if (partitionStrategy === 'gpt') {
    if (backendPath.includes('mapper') || backendPath.startsWith('/dev/md')) {
      return backendPath
    }
    return `${backendPath}1`
  }
  return backendPath
}

export function buildGptPartitionCommands(diskPath: string): string[] {
  const disk = shellSingleQuoteForRemote(diskPath)
  return [
    `parted -s ${disk} mklabel gpt`,
    `parted -s -a optimal ${disk} mkpart primary 1MiB 100%`,
  ]
}

export function buildMkfsCommand(
  device: string,
  fsType: FsType,
  label: string,
): string {
  const dev = shellSingleQuoteForRemote(device)
  const lbl = shellSingleQuoteForRemote(label)
  if (fsType === 'xfs') {
    return `mkfs.xfs -f -L ${lbl} ${dev}`
  }
  return `mkfs.ext4 -F -L ${lbl} ${dev}`
}

export function buildFstabLine(
  uuid: string,
  mountPoint: string,
  fsType: FsType,
): string {
  return `UUID=${uuid}  ${mountPoint}  ${fsType}  defaults  0  0`
}

export function buildCreateFilesystemCommands(input: {
  backendPath: string
  fsType: FsType
  label: string
  mountPoint: string
  partitionStrategy: PartitionStrategy
  uuidPlaceholder?: string
}): string[] {
  const cmds: string[] = []
  if (input.partitionStrategy === 'gpt') {
    cmds.push(...buildGptPartitionCommands(input.backendPath))
  }
  const mkfsTarget = mkfsDevicePath(input.backendPath, input.partitionStrategy)
  cmds.push(buildMkfsCommand(mkfsTarget, input.fsType, input.label))
  cmds.push(`mkdir -p ${shellSingleQuoteForRemote(input.mountPoint)}`)
  cmds.push(`blkid -o export ${shellSingleQuoteForRemote(mkfsTarget)} | grep ^UUID=`)
  cmds.push(`mount ${shellSingleQuoteForRemote(input.mountPoint)}`)
  return cmds
}

export function buildVdiskPath(mountPoint: string, fileName: string): string {
  const base = mountPoint.replace(/\/$/, '')
  return `${base}/${fileName}`
}

export function buildCreateVdiskCommands(
  fullPath: string,
  sizeBytes: number,
  allocMode: VdiskAllocMode,
): string[] {
  const path = shellSingleQuoteForRemote(fullPath)
  if (allocMode === 'fallocate') {
    return [`fallocate -l ${sizeBytes} ${path}`]
  }
  const mb = Math.ceil(sizeBytes / (1024 * 1024))
  return [`dd if=/dev/zero of=${path} bs=1M count=${mb} status=none`]
}

export function buildRemoveVdiskCommand(fullPath: string): string {
  return `rm -f ${shellSingleQuoteForRemote(fullPath)}`
}

export function buildUnmountCommand(mountPoint: string): string {
  return `umount ${shellSingleQuoteForRemote(mountPoint)}`
}
