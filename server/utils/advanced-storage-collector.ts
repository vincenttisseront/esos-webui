import type { SSHSessionManager } from './ssh-session-manager'
import type {
  AdvancedStorageOverview,
  AdvancedStorageTechSummary,
  AdvancedTechId,
  TechPresence,
} from '../../types/advanced-storage'
import { parseDRBDStatus } from './parsers/drbd.parser'
import { parseToolsSection } from './parsers/advanced-storage/tools.parser'
import { parseAdvancedRcConf, parseServiceStatus } from './parsers/advanced-storage/rcconf-advanced.parser'
import { parseMultipathLl } from './parsers/advanced-storage/multipath.parser'
import { parseZpoolList, parseZfsList } from './parsers/advanced-storage/zfs.parser'
import { parseMhvtlSection } from './parsers/advanced-storage/mhvtl.parser'
import { parseBcacheSysfs } from './parsers/advanced-storage/bcache.parser'
import { parseDmCacheTable } from './parsers/advanced-storage/dm-cache.parser'
import { parseLvmCacheLvs } from './parsers/advanced-storage/lvm-cache.parser'
import { parseRbdShowmapped, parseRbdmapConfig } from './parsers/advanced-storage/rbd.parser'
import { parseDeprecatedSection } from './parsers/advanced-storage/deprecated.parser'
import { parseLsblkAdvancedJson } from './parsers/advanced-storage/lsblk-advanced.parser'
import { mergeAdvancedBlockBackends } from './advanced-block-backends'

const MARKERS = [
  '%%TOOLS%%', '%%RCCONF%%', '%%SVCSTATUS%%',
  '%%DRBD_JSON%%', '%%DRBD_PROC%%', '%%DRBD_RCCONF%%', '%%DRBD_SVC%%',
  '%%MULTIPATH%%', '%%ZPOOL%%', '%%ZFSLIST%%', '%%MHVTL%%',
  '%%BCACHE%%', '%%DMCACHE%%', '%%LVMCACHE%%', '%%RBD%%', '%%RBDMAP%%',
  '%%DEPRECATED%%', '%%LSBLK_ADV%%', '%%END%%',
] as const

export const ADV_STORAGE_PROBE_CMD = [
  'echo "%%TOOLS%%"',
  'for _b in drbdadm multipath multipathd zpool zfs rbd ceph dmsetup lvs vtlcmd; do _p=$(command -v "$_b" 2>/dev/null); [ -n "$_p" ] && echo "${_b}=${_p}"; done',
  '[ -d /sys/fs/bcache ] && echo "bcache_sysfs=1" || echo "bcache_sysfs=0"',
  'echo "%%RCCONF%%"',
  'grep -E \'rc\\.(drbd|multipathd|mhvtl|dmcache|rbdmap)_enable\' /etc/rc.conf 2>/dev/null || true',
  'echo "%%SVCSTATUS%%"',
  'for _s in drbd multipathd mhvtl dmcache rbdmap; do if /etc/rc.d/rc."$_s" status >/dev/null 2>&1; then echo "${_s}=running"; else echo "${_s}=stopped"; fi; done 2>/dev/null || true',
  'echo "%%DRBD_JSON%%"',
  'drbdadm status --json 2>/dev/null || echo "DRBD_UNAVAILABLE"',
  'echo "%%DRBD_PROC%%"',
  'cat /proc/drbd 2>/dev/null || echo "DRBD_UNAVAILABLE"',
  'echo "%%DRBD_RCCONF%%"',
  'grep \'rc\\.drbd_enable\' /etc/rc.conf 2>/dev/null || echo "rc.drbd_enable=NO"',
  'echo "%%DRBD_SVC%%"',
  'if /etc/rc.d/rc.drbd status >/dev/null 2>&1; then echo "drbd=running"; else echo "drbd=stopped"; fi',
  'echo "%%MULTIPATH%%"',
  'multipath -ll 2>/dev/null || echo "MULTIPATH_UNAVAILABLE"',
  'echo "%%ZPOOL%%"',
  'zpool list -Hp 2>/dev/null || true',
  'echo "%%ZFSLIST%%"',
  'zfs list -Hp -o name,used,avail,refer,mountpoint 2>/dev/null || true',
  'echo "%%MHVTL%%"',
  'if [ -f /etc/mhvtl/devices.conf ]; then echo "CONFIG_PRESENT=1"; head -n 80 /etc/mhvtl/devices.conf 2>/dev/null; fi',
  'ls /dev/mhvtl/* 2>/dev/null || true',
  'vtlcmd list 2>/dev/null || true',
  'echo "%%BCACHE%%"',
  'find /sys/fs/bcache -maxdepth 2 -type d 2>/dev/null | head -n 50',
  'echo "%%DMCACHE%%"',
  'dmsetup table 2>/dev/null | grep -i cache || true',
  'echo "%%LVMCACHE%%"',
  'lvs -a -o lv_name,vg_name,lv_layout,segtype,cache_mode,origin,data_percent --noheadings 2>/dev/null || true',
  'echo "%%RBD%%"',
  'rbd showmapped 2>/dev/null || true',
  'echo "%%RBDMAP%%"',
  'if [ -f /etc/ceph/rbdmap ]; then echo "RBDMAP_PRESENT=1"; cat /etc/ceph/rbdmap 2>/dev/null; fi',
  'ls /dev/rbd/* 2>/dev/null || true',
  'echo "%%DEPRECATED%%"',
  'command -v lessfs >/dev/null 2>&1 && echo "lessfs=1" || echo "lessfs=0"',
  'command -v enhanceio >/dev/null 2>&1 && echo "enhanceio=1" || echo "enhanceio=0"',
  'grep -E \'lessfs|btier|enhanceio\' /etc/rc.conf 2>/dev/null | grep -qi btier && echo "btier=1" || true',
  'lsmod 2>/dev/null | grep -E \'flashcache|enhanceio\' && echo "deprecated_mod=1" || true',
  'echo "%%LSBLK_ADV%%"',
  'lsblk -J -b -o NAME,PATH,SIZE,TYPE,FSTYPE,MOUNTPOINT 2>/dev/null || echo "{}"',
  'echo "%%END%%"',
].join('; ')

function section(raw: string, name: string): string {
  const marker = `%%${name}%%`
  const startPos = raw.indexOf(marker)
  if (startPos === -1) return ''
  const after = startPos + marker.length
  const markerIdx = MARKERS.indexOf(marker as typeof MARKERS[number])
  const nextMarker = MARKERS[markerIdx + 1]
  const endPos = nextMarker ? raw.indexOf(nextMarker, after) : raw.length
  return raw.slice(after, endPos === -1 ? raw.length : endPos).trim()
}

export function splitAdvStorageSections(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of MARKERS) {
    const name = m.replace(/%%/g, '')
    if (name === 'END') continue
    out[name] = section(raw, name)
  }
  return out
}

function techHealth(
  presence: TechPresence,
  critical = false,
): AdvancedStorageTechSummary['health'] {
  if (presence === 'not_installed') return 'n/a'
  if (critical) return 'critical'
  if (presence === 'active') return 'ok'
  if (presence === 'configured') return 'warning'
  return 'unknown'
}

function buildTechnologies(input: {
  tools: ReturnType<typeof parseToolsSection>
  rc: ReturnType<typeof parseAdvancedRcConf>
  svc: Record<string, boolean>
  drbd: ReturnType<typeof parseDRBDStatus>
  multipathCount: number
  zfsPools: number
  mhvtlDevices: number
  bcacheCount: number
  dmCacheCount: number
  lvmCacheCount: number
  rbdCount: number
  deprecatedCount: number
}): AdvancedStorageTechSummary[] {
  const summaries: AdvancedStorageTechSummary[] = []

  const add = (
    id: AdvancedTechId,
    presence: TechPresence,
    resourceCount: number,
    summaryKey: string,
    opts?: Partial<AdvancedStorageTechSummary>,
  ) => {
    summaries.push({
      id,
      presence,
      resourceCount,
      health: techHealth(presence, opts?.health === 'critical'),
      summaryKey,
      ...opts,
    })
  }

  const hasDrbd = !!input.tools.binaryPaths.drbdadm || input.drbd.available
  const drbdPresence: TechPresence = !hasDrbd
    ? 'not_installed'
    : input.drbd.resources.length > 0 && input.drbd.running
      ? 'active'
      : input.rc.drbd || input.drbd.resources.length > 0
        ? 'configured'
        : 'installed'
  add('drbd', drbdPresence, input.drbd.resources.length, 'advanced_storage.summary.drbd', {
    enabled: input.rc.drbd ?? input.drbd.enabled,
    running: input.drbd.running,
  })

  const hasMp = !!input.tools.binaryPaths.multipath
  const mpPresence: TechPresence = !hasMp
    ? 'not_installed'
    : input.multipathCount > 0 && input.svc.multipathd
      ? 'active'
      : input.multipathCount > 0 || input.rc.multipathd
        ? 'configured'
        : 'installed'
  add('multipath', mpPresence, input.multipathCount, 'advanced_storage.summary.multipath', {
    enabled: input.rc.multipathd,
    running: input.svc.multipathd,
  })

  const hasZfs = !!(input.tools.binaryPaths.zpool || input.tools.binaryPaths.zfs)
  const zfsPresence: TechPresence = !hasZfs
    ? 'not_installed'
    : input.zfsPools > 0
      ? 'active'
      : 'installed'
  add('zfs', zfsPresence, input.zfsPools, 'advanced_storage.summary.zfs')

  const mhPresence: TechPresence = input.mhvtlDevices > 0 || input.rc.mhvtl
    ? input.svc.mhvtl ? 'active' : 'configured'
    : input.tools.binaryPaths.vtlcmd ? 'installed' : 'not_installed'
  add('mhvtl', mhPresence, input.mhvtlDevices, 'advanced_storage.summary.mhvtl', {
    enabled: input.rc.mhvtl,
    running: input.svc.mhvtl,
  })

  const bcPresence: TechPresence = !input.tools.sysfsPresent.bcache
    ? 'not_installed'
    : input.bcacheCount > 0 ? 'active' : 'installed'
  add('bcache', bcPresence, input.bcacheCount, 'advanced_storage.summary.bcache')

  const dmPresence: TechPresence = !input.tools.binaryPaths.dmsetup
    ? 'not_installed'
    : input.dmCacheCount > 0
      ? input.svc.dmcache ? 'active' : 'configured'
      : 'installed'
  add('dm_cache', dmPresence, input.dmCacheCount, 'advanced_storage.summary.dm_cache', {
    enabled: input.rc.dmcache,
    running: input.svc.dmcache,
  })

  const lvmPresence: TechPresence = !input.tools.binaryPaths.lvs
    ? 'not_installed'
    : input.lvmCacheCount > 0 ? 'active' : 'installed'
  add('lvm_cache', lvmPresence, input.lvmCacheCount, 'advanced_storage.summary.lvm_cache')

  const rbdPresence: TechPresence = !input.tools.binaryPaths.rbd
    ? 'not_installed'
    : input.rbdCount > 0
      ? input.svc.rbdmap ? 'active' : 'configured'
      : 'installed'
  add('ceph_rbd', rbdPresence, input.rbdCount, 'advanced_storage.summary.ceph_rbd', {
    enabled: input.rc.rbdmap,
    running: input.svc.rbdmap,
  })

  if (input.deprecatedCount > 0) {
    add('deprecated_lessfs', 'configured', input.deprecatedCount, 'advanced_storage.summary.deprecated', {
      deprecated: true,
      health: 'warning',
    })
  }

  return summaries
}

export async function collectAdvancedStorageOverview(
  manager: SSHSessionManager,
  sanId: string,
  clusterId?: string | null,
): Promise<AdvancedStorageOverview> {
  const rawErrors: AdvancedStorageOverview['rawErrors'] = []
  let raw = ''
  try {
    const result = await manager.exec(ADV_STORAGE_PROBE_CMD, 60_000)
    raw = result.stdout
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    rawErrors.push({ section: 'probe', message })
    throw createError({ statusCode: 503, statusMessage: message })
  }

  const sections = splitAdvStorageSections(raw)
  const tools = parseToolsSection(sections.TOOLS ?? '')
  const rc = parseAdvancedRcConf(sections.RCCONF ?? '')
  const svc = parseServiceStatus(sections.SVCSTATUS ?? '')

  const drbd = parseDRBDStatus(
    sections.DRBD_JSON ?? '',
    sections.DRBD_PROC ?? '',
    sections.DRBD_RCCONF ?? '',
    sections.DRBD_SVC ?? '',
  )

  const multipathMaps = parseMultipathLl(sections.MULTIPATH ?? '')
  const zfsPools = parseZpoolList(sections.ZPOOL ?? '')
  const zfsDatasets = parseZfsList(sections.ZFSLIST ?? '')
  const mhvtl = parseMhvtlSection(sections.MHVTL ?? '')
  const bcacheDevices = parseBcacheSysfs(sections.BCACHE ?? '')
  const dmTargets = parseDmCacheTable(sections.DMCACHE ?? '')
  const lvmCacheVolumes = parseLvmCacheLvs(sections.LVMCACHE ?? '')
  const rbdMappings = parseRbdShowmapped(sections.RBD ?? '')
  const rbdConfigPaths = parseRbdmapConfig(sections.RBDMAP ?? '')
  const deprecated = parseDeprecatedSection(
    [sections.DEPRECATED, sections.RBDMAP].filter(Boolean).join('\n'),
  )
  const lsblkRows = parseLsblkAdvancedJson(sections.LSBLK_ADV ?? '{}')

  const technologies = buildTechnologies({
    tools,
    rc,
    svc,
    drbd,
    multipathCount: multipathMaps.length,
    zfsPools: zfsPools.length,
    mhvtlDevices: mhvtl.devices.length,
    bcacheCount: bcacheDevices.length,
    dmCacheCount: dmTargets.length,
    lvmCacheCount: lvmCacheVolumes.length,
    rbdCount: rbdMappings.length,
    deprecatedCount: deprecated.length,
  })

  const advancedBlockBackends = mergeAdvancedBlockBackends({
    lsblkRows,
    drbd,
    multipathMaps,
    bcacheDevices,
    dmTargets,
    lvmCacheVolumes,
    rbdMappings,
    zfsPools,
  })

  return {
    sanId,
    scannedAt: Date.now(),
    tools,
    rc,
    technologies,
    drbd,
    multipath: { maps: multipathMaps },
    zfs: { pools: zfsPools, datasets: zfsDatasets },
    mhvtl,
    bcache: { devices: bcacheDevices },
    dmCache: { targets: dmTargets },
    lvmCache: { volumes: lvmCacheVolumes },
    cephRbd: { mappings: rbdMappings, configPaths: rbdConfigPaths },
    deprecated,
    advancedBlockBackends,
    rawErrors,
    clusterId: clusterId ?? null,
  }
}
