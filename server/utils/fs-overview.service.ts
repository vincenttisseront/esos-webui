import { getActiveSSHManager } from './ssh-runtime'
import { readScstDeviceIndex } from './scst-device-index'
import { readScstConfig } from './scst-config-reader'
import { collectFsBackendCandidates } from './fs-candidates'
import { computeFsNextAction } from '~/utils/fs-provisioning-chain'
import {
  collectFileioDevicesFromConfig,
  collectLunMappingsFromConfig,
  deviceNamesMappedInLuns,
} from '~/utils/fs-scst-inventory'
import {
  mergeMountSources,
  parseBlkidUuid,
  parseDfBytesLine,
  parseFindmntJson,
  parseFindmntLines,
  parseFstabLines,
  parseLsblkMounts,
  buildMountRow,
} from '~/utils/fs-overview-parser'
import type { FileSystemMount, FsOverview, FsToolsInfo, VDiskFile } from '~/types/filesystem'
import type { SSHSessionManager } from './ssh-session-manager'

const VDISK_GLOB = '*.img'

export function vdiskMountRoots(): string[] {
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

async function dfForMount(
  manager: SSHSessionManager,
  mountPoint: string,
): Promise<{ totalBytes: number; usedBytes: number; availBytes: number } | undefined> {
  const q = `'${mountPoint.replace(/'/g, `'\\''`)}'`
  const df = await manager.exec(`df -B1 ${q} 2>/dev/null | tail -1`, 10_000)
  return parseDfBytesLine(df.stdout.trim()) ?? undefined
}

async function collectMounts(manager: SSHSessionManager): Promise<{
  mounts: FileSystemMount[]
  warnings: string[]
}> {
  const warnings: string[] = []
  const findmntJson = await manager.exec('findmnt -J 2>/dev/null || true', 15_000)
  let findmntRows = parseFindmntJson(findmntJson.stdout)
  if (!findmntRows.length) {
    const findmntLo = await manager.exec(
      'findmnt -lo TARGET,SOURCE,FSTYPE 2>/dev/null | tail -n +2',
      15_000,
    )
    findmntRows = parseFindmntLines(findmntLo.stdout)
    if (findmntRows.length) warnings.push('findmnt -J indisponible, repli sur findmnt -lo')
  }

  const lsblk = await manager.exec('lsblk -J -b -f 2>/dev/null || true', 15_000)
  const lsblkRows = parseLsblkMounts(lsblk.stdout)

  const dfRoots: Array<{ target: string; source: string; fstype: string }> = []
  for (const root of vdiskMountRoots()) {
    const q = `'${root.replace(/'/g, `'\\''`)}'`
    const df = await manager.exec(`df -B1 ${q} 2>/dev/null | tail -1`, 10_000)
    const parsed = parseDfBytesLine(df.stdout.trim())
    if (parsed && parsed.totalBytes > 0) {
      dfRoots.push({ target: root, source: root, fstype: 'xfs' })
    }
  }

  const merged = mergeMountSources([
    { rows: findmntRows, source: 'findmnt' },
    { rows: lsblkRows, source: 'lsblk' },
    { rows: dfRoots, source: 'df' },
  ])

  const dfByMount = new Map<string, { totalBytes: number; usedBytes: number; availBytes: number }>()
  for (const mp of merged.keys()) {
    const df = await dfForMount(manager, mp)
    if (df) dfByMount.set(mp, df)
  }

  const mounts: FileSystemMount[] = []
  for (const [, row] of merged) {
    mounts.push(buildMountRow(row, dfByMount.get(row.target), row.sourceKind))
  }
  mounts.sort((a, b) => a.mountPoint.localeCompare(b.mountPoint))

  const fstabRead = await manager.exec('cat /etc/fstab 2>/dev/null || true', 10_000)
  const fstabMap = parseFstabLines(fstabRead.stdout)
  const blkid = await manager.exec('blkid 2>/dev/null || true', 15_000)
  const uuids = parseBlkidUuid(blkid.stdout)

  for (const m of mounts) {
    const entry = fstabMap.get(m.mountPoint)
    if (entry) m.fstabEntry = entry
    const uuid = uuids.get(m.backingDevice)
    if (uuid) m.uuid = uuid
  }

  return { mounts, warnings }
}

function longestMountPrefix(path: string, mounts: FileSystemMount[]): string {
  let best = ''
  for (const m of mounts) {
    if (path.startsWith(`${m.mountPoint}/`) && m.mountPoint.length > best.length) {
      best = m.mountPoint
    }
  }
  return best
}

async function scanVdiskFiles(
  manager: SSHSessionManager,
  mounts: FileSystemMount[],
  pathToDevices: Map<string, string[]>,
  lunDeviceNames: Set<string>,
): Promise<VDiskFile[]> {
  const roots = new Set<string>([...vdiskMountRoots(), ...mounts.map(m => m.mountPoint)])
  const files: VDiskFile[] = []
  const seen = new Set<string>()

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
      if (seen.has(path)) continue
      seen.add(path)
      const sizeBytes = Number.parseInt(t.slice(sp + 1), 10) || 0
      const fileName = path.split('/').pop() ?? path
      const mountPoint = longestMountPrefix(path, mounts) || root
      const scstDeviceNames = pathToDevices.get(path) ?? []
      const mappedByPath = scstDeviceNames.length > 0
      const mappedByLun = scstDeviceNames.some(n => lunDeviceNames.has(n))
      files.push({
        path,
        fileName,
        sizeBytes,
        mountPoint,
        scstDeviceNames,
        mapped: mappedByPath || mappedByLun,
      })
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

export async function collectFsOverview(manager?: SSHSessionManager): Promise<FsOverview> {
  const ssh = manager ?? getActiveSSHManager()
  const scanWarnings: string[] = []

  const [tools, scstIndex, scstConfig, mountResult] = await Promise.all([
    probeTools(ssh),
    readScstDeviceIndex(ssh),
    readScstConfig().catch(() => ({ handlers: [], drivers: [] })),
    collectMounts(ssh),
  ])

  scanWarnings.push(...mountResult.warnings)
  const mounts = mountResult.mounts

  const lunMappings = collectLunMappingsFromConfig(scstConfig)
  const lunDeviceNames = deviceNamesMappedInLuns(lunMappings)
  const fileioDevices = collectFileioDevicesFromConfig(scstConfig, lunDeviceNames)

  const vdiskFiles = await scanVdiskFiles(ssh, mounts, scstIndex.pathToDevices, lunDeviceNames)

  const overview: FsOverview = {
    scannedAt: Date.now(),
    mounts,
    vdiskFiles,
    fileioDevices,
    lunMappings,
    tools,
    nextAction: { kind: 'none', messageKey: 'storage.fs.next.none' },
    scanWarnings,
  }

  overview.nextAction = computeFsNextAction(overview)

  return overview
}

export async function collectFsOverviewWithCandidates(
  manager?: SSHSessionManager,
): Promise<FsOverview & { candidates: Awaited<ReturnType<typeof collectFsBackendCandidates>> }> {
  const ssh = manager ?? getActiveSSHManager()
  const overview = await collectFsOverview(ssh)
  const candidates = await collectFsBackendCandidates(ssh)
  return { ...overview, candidates }
}
