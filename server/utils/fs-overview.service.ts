import { getActiveSSHManager } from './ssh-runtime'
import { readScstDeviceIndex } from './scst-device-index'
import {
  mergeMountWithDf,
  parseBlkidUuid,
  parseFindmntLines,
  parseFstabLines,
} from '~/utils/fs-overview-parser'
import type { FileSystemMount, FsOverview, FsToolsInfo, VDiskFile } from '~/types/filesystem'
import type { SSHSessionManager } from './ssh-session-manager'

const VDISK_GLOB = '*.img'

function vdiskMountRoots(): string[] {
  const raw = process.env.ESOS_VDISK_MOUNT_ROOTS ?? '/mnt/vdisks'
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

async function probeTools(manager: SSHSessionManager): Promise<FsToolsInfo> {
  const cmd = [
    'for t in mkfs.xfs mkfs.ext4 parted fallocate df findmnt blkid; do',
    'command -v "$t" >/dev/null 2>&1 && echo "$t=1" || echo "$t=0";',
    'done',
  ].join(' ')
  const r = await manager.exec(cmd, 10_000)
  const map = new Map<string, boolean>()
  for (const line of r.stdout.split('\n')) {
    const [k, v] = line.split('=')
    if (k) map.set(k, v === '1')
  }
  return {
    mkfs_xfs: map.get('mkfs.xfs') ?? false,
    mkfs_ext4: map.get('mkfs.ext4') ?? false,
    parted: map.get('parted') ?? false,
    fallocate: map.get('fallocate') ?? false,
    df: map.get('df') ?? false,
    findmnt: map.get('findmnt') ?? false,
    blkid: map.get('blkid') ?? false,
  }
}

async function collectMounts(manager: SSHSessionManager): Promise<FileSystemMount[]> {
  const findmnt = await manager.exec(
    "findmnt -lo TARGET,SOURCE,FSTYPE -t xfs,ext4,ext3 2>/dev/null | tail -n +2",
    15_000,
  )
  const parsed = parseFindmntLines(findmnt.stdout)

  const dfByMount = new Map<string, { totalBytes: number; usedBytes: number; availBytes: number }>()
  for (const m of parsed) {
    const q = `'${m.target.replace(/'/g, `'\\''`)}'`
    const df = await manager.exec(`df -B1 ${q} 2>/dev/null | tail -1`, 10_000)
    const parts = df.stdout.trim().split(/\s+/)
    if (parts.length >= 4) {
      dfByMount.set(m.target, {
        totalBytes: Number.parseInt(parts[1], 10) || 0,
        usedBytes: Number.parseInt(parts[2], 10) || 0,
        availBytes: Number.parseInt(parts[3], 10) || 0,
      })
    }
  }

  const fstabRead = await manager.exec('cat /etc/fstab 2>/dev/null || true', 10_000)
  const fstabMap = parseFstabLines(fstabRead.stdout)
  const mounts = mergeMountWithDf(parsed, dfByMount)

  const blkid = await manager.exec('blkid 2>/dev/null || true', 15_000)
  const uuids = parseBlkidUuid(blkid.stdout)

  for (const m of mounts) {
    const entry = fstabMap.get(m.mountPoint)
    if (entry) m.fstabEntry = entry
    const uuid = uuids.get(m.backingDevice)
    if (uuid) m.uuid = uuid
  }

  return mounts
}

async function scanVdiskFiles(
  manager: SSHSessionManager,
  mounts: FileSystemMount[],
  scstPaths: Map<string, string[]>,
): Promise<VDiskFile[]> {
  const roots = new Set<string>([...vdiskMountRoots(), ...mounts.map(m => m.mountPoint)])
  const files: VDiskFile[] = []

  for (const root of roots) {
    const q = `'${root.replace(/'/g, `'\\''`)}'`
    const cmd = [
      `if [ -d ${q} ]; then`,
      `find ${q} -maxdepth 3 -type f \\( -name '${VDISK_GLOB}' -o -name 'vdisk*' \\) -printf '%p %s\\n' 2>/dev/null;`,
      'fi',
    ].join(' ')
    const r = await manager.exec(cmd, 30_000)
    for (const line of r.stdout.split('\n')) {
      const t = line.trim()
      if (!t) continue
      const sp = t.lastIndexOf(' ')
      if (sp <= 0) continue
      const path = t.slice(0, sp).trim()
      const sizeBytes = Number.parseInt(t.slice(sp + 1), 10) || 0
      const fileName = path.split('/').pop() ?? path
      const mountPoint = mounts.find(m => path.startsWith(`${m.mountPoint}/`))?.mountPoint ?? root
      const scstDeviceNames = scstPaths.get(path) ?? []
      files.push({
        path,
        fileName,
        sizeBytes,
        mountPoint,
        scstDeviceNames,
        mapped: scstDeviceNames.length > 0,
      })
    }
  }

  return files
}

export async function collectFsOverview(manager?: SSHSessionManager): Promise<FsOverview> {
  const ssh = manager ?? getActiveSSHManager()
  const [tools, scstIndex] = await Promise.all([
    probeTools(ssh),
    readScstDeviceIndex(ssh),
  ])
  const mounts = await collectMounts(ssh)
  const vdiskFiles = await scanVdiskFiles(ssh, mounts, scstIndex.pathToDevices)

  return {
    scannedAt: Date.now(),
    mounts,
    vdiskFiles,
    tools,
  }
}
