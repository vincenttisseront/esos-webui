import type { DRBDResource, DRBDStatus } from '../server/utils/parsers/drbd.parser'

export type AdvancedTechId =
  | 'drbd'
  | 'multipath'
  | 'zfs'
  | 'mhvtl'
  | 'bcache'
  | 'dm_cache'
  | 'lvm_cache'
  | 'ceph_rbd'
  | 'deprecated_lessfs'
  | 'deprecated_enhanceio'
  | 'deprecated_btier'

export type TechPresence = 'not_installed' | 'installed' | 'configured' | 'active'

export type AdvancedTechHealth = 'ok' | 'warning' | 'critical' | 'unknown' | 'n/a'

export type AdvancedBlockBackendKind =
  | 'drbd'
  | 'multipath'
  | 'bcache'
  | 'dm_cache'
  | 'lvm_cache'
  | 'rbd'
  | 'zfs_vol'

export interface AdvancedStorageToolInfo {
  binaryPaths: Record<string, string | null>
  sysfsPresent: Record<string, boolean>
}

export interface AdvancedStorageRcFlags {
  drbd?:       boolean
  multipathd?: boolean
  mhvtl?:      boolean
  dmcache?:    boolean
  rbdmap?:     boolean
}

export interface AdvancedStorageTechSummary {
  id:            AdvancedTechId
  presence:      TechPresence
  enabled?:      boolean | null
  running?:      boolean | null
  resourceCount: number
  health:        AdvancedTechHealth
  summaryKey:    string
  summaryParams?: Record<string, string | number>
  deprecated?:   boolean
}

export interface AdvancedBlockBackend {
  path:         string
  kind:         AdvancedBlockBackendKind
  displayName:  string
  sizeBytes?:   number
  sourceTech:   AdvancedTechId
  details?:     Record<string, string | number>
  usedByHints:  string[]
}

export interface MultipathMap {
  wwid:       string
  alias:      string
  dmDevice:   string
  pathCount:  number
  paths:      Array<{ device: string; state: string }>
}

export interface ZfsPool {
  name:      string
  sizeBytes: number
  freeBytes: number
  health:    string
}

export interface ZfsDataset {
  name:       string
  usedBytes:  number
  availBytes: number
  mountpoint: string
}

export interface MhvtlDevice {
  name:   string
  path?:  string
}

export interface BcacheDevice {
  name:         string
  backingPath?: string
  state?:       string
}

export interface DmCacheTarget {
  name:       string
  cacheMode?: string
  origin?:    string
}

export interface LvmCacheVolume {
  lv:         string
  vg:         string
  layout:     string
  segtype:    string
  cacheMode?: string
  origin?:    string
  dataPercent?: number
}

export interface RbdMapping {
  pool:    string
  image:   string
  device:  string
  snap?:   string
}

export interface DeprecatedTechStatus {
  id:      'lessfs' | 'enhanceio' | 'btier'
  detected: boolean
  reason?:  string
}

export interface AdvancedStorageOverview {
  sanId:                 string
  scannedAt:             number
  tools:                 AdvancedStorageToolInfo
  rc:                    AdvancedStorageRcFlags
  technologies:          AdvancedStorageTechSummary[]
  drbd:                  DRBDStatus
  multipath:             { maps: MultipathMap[] }
  zfs:                   { pools: ZfsPool[]; datasets: ZfsDataset[] }
  mhvtl:                 { devices: MhvtlDevice[]; configPresent: boolean }
  bcache:                { devices: BcacheDevice[] }
  dmCache:               { targets: DmCacheTarget[] }
  lvmCache:              { volumes: LvmCacheVolume[] }
  cephRbd:               { mappings: RbdMapping[]; configPaths: string[] }
  deprecated:            DeprecatedTechStatus[]
  advancedBlockBackends: AdvancedBlockBackend[]
  rawErrors:             Array<{ section: string; message: string }>
  clusterId?:            string | null
}

export type { DRBDResource }
