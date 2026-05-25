import { getActiveSSHManager } from './ssh-runtime'
import { readScstDeviceIndex, readScstSysfsFileioMap } from './scst-device-index'
import { readScstConfig } from './scst-config-reader'
import { collectLvmOverview } from './lvm-overview.service'
import { collectRaidOverview } from './raid-overview.service'
import {
  buildFsBackendsAndLinks,
  buildFsDiagnostics,
  buildFsResourceLinks,
  buildPathAliasIndex,
  enrichMountsWithRolesAndLinks,
  vdiskMountRootsFromEnv,
} from './fs-inventory-resolver'
import { computeFsNextAction } from '~/utils/fs-provisioning-chain'
import {
  collectFileioDevicesFromConfig,
  collectLunMappingsFromConfig,
  deviceNamesMappedInLuns,
  fileioFilenamesFromDevices,
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
import type { FileSystemMount, FsBackendCandidate, FsOverview, FsScanError, FsToolsInfo, VDiskFile } from '~/types/filesystem'
import type { SSHSessionManager } from './ssh-session-manager'
import { collectScannerErrors, FS_SCANNER_FALLBACKS, runFsScanner } from './fs-scanner-runner'

const VDISK_GLOB = '*.img'

export function vdiskMountRoots(): string[] {
  return vdiskMountRootsFromEnv()
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
  findmntCount: number
  lsblkCount: number
  dfCount: number
}> {
  const warnings: string[] = []
  const findmntJson = await manager.exec('findmnt -J 2>/dev/null || true', 15_000)
  let findmntRows = parseFindmntJson(findmntJson.stdout)
  const findmntCount = findmntRows.length
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
  const lsblkCount = lsblkRows.length

  const dfRoots: Array<{ target: string; source: string; fstype: string }> = []
  for (const root of vdiskMountRoots()) {
    const q = `'${root.replace(/'/g, `'\\''`)}'`
    const df = await manager.exec(`df -B1 ${q} 2>/dev/null | tail -1`, 10_000)
    const parsed = parseDfBytesLine(df.stdout.trim())
    if (parsed && parsed.totalBytes > 0) {
      dfRoots.push({ target: root, source: root, fstype: 'xfs' })
    }
  }
  const dfCount = dfRoots.length

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
    for (const bp of m.backingPaths ?? [m.backingDevice]) {
      const uuid = uuids.get(bp)
      if (uuid) m.uuid = uuid
    }
  }

  return { mounts, warnings, findmntCount, lsblkCount, dfCount }
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

async function statFileSize(manager: SSHSessionManager, path: string): Promise<number> {
  const q = `'${path.replace(/'/g, `'\\''`)}'`
  const r = await manager.exec(`stat -c '%s' ${q} 2>/dev/null || echo 0`, 5_000)
  return Number.parseInt(r.stdout.trim(), 10) || 0
}

async function buildVdiskInventory(
  manager: SSHSessionManager,
  mounts: FileSystemMount[],
  pathToDevices: Map<string, string[]>,
  lunDeviceNames: Set<string>,
  fileioDevices: Array<{ name: string; filename: string }>,
): Promise<VDiskFile[]> {
  const files: VDiskFile[] = []
  const seen = new Set<string>()

  const add = (entry: {
    path: string
    sizeBytes: number
    source: VDiskFile['source']
    fileioDeviceName?: string
  }) => {
    if (!entry.path || seen.has(entry.path)) return
    seen.add(entry.path)
    const fileName = entry.path.split('/').pop() ?? entry.path
    const mountPoint = longestMountPrefix(entry.path, mounts) || vdiskMountRoots()[0] || '/'
    const scstDeviceNames = pathToDevices.get(entry.path) ?? []
    if (entry.fileioDeviceName && !scstDeviceNames.includes(entry.fileioDeviceName)) {
      scstDeviceNames.push(entry.fileioDeviceName)
    }
    const mappedByPath = scstDeviceNames.length > 0
    const mappedByLun = scstDeviceNames.some(n => lunDeviceNames.has(n))
    files.push({
      path: entry.path,
      fileName,
      sizeBytes: entry.sizeBytes,
      mountPoint,
      scstDeviceNames,
      mapped: mappedByPath || mappedByLun,
      source: entry.source,
      fileioDeviceName: entry.fileioDeviceName,
    })
  }

  for (const d of fileioDevices) {
    if (!d.filename) continue
    const size = await statFileSize(manager, d.filename)
    add({ path: d.filename, sizeBytes: size, source: 'scst_config', fileioDeviceName: d.name })
  }

  for (const [path] of pathToDevices) {
    if (!path.startsWith('/')) continue
    const size = await statFileSize(manager, path)
    add({ path, sizeBytes: size, source: 'scst_sysfs' })
  }

  const roots = new Set<string>([...vdiskMountRoots(), ...mounts.map(m => m.mountPoint)])
  for (const root of roots) {
    const q = `'${root.replace(/'/g, `'\\''`)}'`
    const cmd = [
      `if [ -d ${q} ]; then`,
      `find ${q} -maxdepth 3 -type f \\( -name '${VDISK_GLOB}' -o -name 'vdisk*' \\) -printf '%p %s\\n' 2>/dev/null;`,
      `find ${q} -maxdepth 3 -type f ! -name '.*' -printf '%p %s\\n' 2>/dev/null | head -n 500;`,
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
      add({ path, sizeBytes, source: 'scan' })
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

export async function collectFsOverview(manager?: SSHSessionManager): Promise<FsOverview> {
  const ssh = manager ?? getActiveSSHManager()
  const scanWarnings: string[] = []

  const toolsR = await runFsScanner('tools', FS_SCANNER_FALLBACKS.tools, () => probeTools(ssh))
  const scstIndexR = await runFsScanner('scst_index', FS_SCANNER_FALLBACKS.scstIndex, () => readScstDeviceIndex(ssh))
  const scstConfigR = await runFsScanner('scst_config', FS_SCANNER_FALLBACKS.scstConfig, () => readScstConfig(ssh))
  const mountR = await runFsScanner('mounts', FS_SCANNER_FALLBACKS.mounts, () => collectMounts(ssh))
  const raidR = await runFsScanner('raid', FS_SCANNER_FALLBACKS.raid, () => collectRaidOverview(ssh))
  const lvmR = await runFsScanner('lvm', FS_SCANNER_FALLBACKS.lvm, () => collectLvmOverview(ssh))
  const sysfsR = await runFsScanner('scst_sysfs', FS_SCANNER_FALLBACKS.sysfsFileio, () => readScstSysfsFileioMap(ssh))

  const scannerErrors: FsScanError[] = collectScannerErrors([
    toolsR,
    scstIndexR,
    scstConfigR,
    mountR,
    raidR,
    lvmR,
    sysfsR,
  ])

  const tools = toolsR.value
  const scstIndex = scstIndexR.value
  const scstConfig = scstConfigR.value as Awaited<ReturnType<typeof readScstConfig>>
  const mountResult = mountR.value
  const raid = raidR.value as Awaited<ReturnType<typeof collectRaidOverview>>
  const lvm = lvmR.value as Awaited<ReturnType<typeof collectLvmOverview>>
  const sysfsFileio = sysfsR.value

  const scstConfigBytes = scstConfig.handlers.length + scstConfig.drivers.length

  scanWarnings.push(...mountResult.warnings)
  let mounts = mountResult.mounts

  const lunMappings = collectLunMappingsFromConfig(scstConfig)
  const lunDeviceNames = deviceNamesMappedInLuns(lunMappings)
  const fileioDevices = collectFileioDevicesFromConfig(scstConfig, lunDeviceNames, sysfsFileio)
  const fileioFilenames = fileioFilenamesFromDevices(fileioDevices)

  const index = buildPathAliasIndex(raid.blockDevices)
  const enriched = enrichMountsWithRolesAndLinks(mounts, fileioFilenames, index)
  mounts = enriched.mounts

  if (raid.tools && mounts.length) {
    raid.hardwareControllers = enrichHardwareLdOsPaths({
      controllers: raid.hardwareControllers,
      blockDevices: raid.blockDevices,
      kernelLogicalDrives: [],
      tools: raid.tools,
      mounts,
    })
  }

  const vdiskR = await runFsScanner('vdisk_files', [] as VDiskFile[], () =>
    buildVdiskInventory(ssh, mounts, scstIndex.pathToDevices, lunDeviceNames, fileioDevices),
  )
  if (vdiskR.error) scannerErrors.push(vdiskR.error)
  const vdiskFiles = vdiskR.value

  const inventory = buildFsBackendsAndLinks({
    raid,
    lvm,
    mounts,
    pathToDevices: scstIndex.pathToDevices,
    allowRawDisk: false,
    tools: raid.tools,
  })
  const backends = inventory.backends

  const resourceLinks = [
    ...enriched.links,
    ...inventory.links,
    ...buildFsResourceLinks(
      backends,
      mounts,
      vdiskFiles,
      fileioDevices,
      lunMappings,
    ),
  ]

  const vdiskScanRoots = [...new Set([...vdiskMountRoots(), ...mounts.map(m => m.mountPoint)])]

  const diagnostics = buildFsDiagnostics({
    findmntCount: mountResult.findmntCount,
    lsblkCount: mountResult.lsblkCount,
    dfCount: mountResult.dfCount,
    mounts,
    scstConfigBytes,
    scstHandlers: scstConfig.handlers.length,
    fileioCount: fileioDevices.length,
    lunCount: lunMappings.length,
    sysfsDeviceCount: sysfsFileio.size,
    vdiskFileCount: vdiskFiles.length,
    backends,
    vdiskScanRoots,
    warnings: scanWarnings,
  })

  const candidates: FsBackendCandidate[] = backends.map(b => ({
    path: b.path,
    kind: b.kind,
    sizeBytes: b.sizeBytes,
    eligible: b.eligible,
    reasons: b.reasons,
    displayName: b.displayName,
  }))

  const partial = scannerErrors.length > 0

  const overview: FsOverview = {
    scannedAt: Date.now(),
    mounts,
    vdiskFiles,
    fileioDevices,
    lunMappings,
    backends,
    links: resourceLinks,
    diagnostics,
    tools,
    nextAction: { kind: 'none', messageKey: 'storage.fs.next.none' },
    scanWarnings,
    warnings: [...scanWarnings],
    errors: scannerErrors,
    partial,
    candidates,
  }

  overview.nextAction = computeFsNextAction(overview)
  return overview
}

export async function collectFsOverviewWithCandidates(
  manager?: SSHSessionManager,
): Promise<FsOverview> {
  return collectFsOverview(manager)
}
