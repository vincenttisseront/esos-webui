/**
 * Types partagés pour les métriques I/O SCST (cf. SDD v2.2 §4).
 */

// ─── Utilisateurs / RBAC (cf. SDD v3.7) ─────────────────────────────────────

export type UserRole = 'admin' | 'operator' | 'viewer'

export interface UserPublic {
  id:                  string
  username:            string
  displayName:         string | null
  role:                UserRole
  active:              boolean
  forcePasswordChange: boolean
  createdAt:           string
  lastLoginAt:         string | null
  createdBy:           string | null
  /** `local` | `ldap` | `oidc` — défaut local si absent en BDD. */
  authSource?:         'local' | 'ldap' | 'oidc'
  isCurrentUser?:      boolean
  isLastAdmin?:        boolean
}

export interface CreateUserInput {
  username:            string
  displayName?:        string
  role?:               UserRole
  password?:           string
  forcePasswordChange: boolean
}

export interface UpdateUserInput {
  displayName?: string | null
  role?:        UserRole
  active?:      boolean
}

// ─── Snapshots bruts (lecture sysfs) ────────────────────────────────────────

export interface SessionSnapshot {
  capturedAt: number // Date.now()
  target: string // WWN target
  initiator: string // WWN initiateur
  driver: string
  lunsCount: number
  readKb: number // Cumulatif
  writeKb: number // Cumulatif
}

export interface DeviceSnapshot {
  capturedAt: number
  device: string // "LINUX" | "TOOLS" | "WINDOWS"
  handler: string // "vdisk_fileio"
  readKb: number // Cumulatif
  writeKb: number // Cumulatif
  readOps: number // Cumulatif IOPS
  writeOps: number // Cumulatif IOPS
}

// ─── Débits calculés (delta entre deux snapshots) ────────────────────────────

export interface ThroughputPoint {
  t: number // timestamp
  readKbps: number
  writeKbps: number
}

export interface SessionThroughput {
  target: string
  initiator: string
  lunsCount: number
  readKbTotal: number // Valeur cumulée actuelle
  writeKbTotal: number // Valeur cumulée actuelle
  readKbPerSec: number // Débit calculé (delta / dt)
  writeKbPerSec: number // Débit calculé (delta / dt)
  history: ThroughputPoint[] // Pour sparkline (2 min)
}

export interface DeviceThroughput {
  device: string
  handler: string
  readKbTotal: number
  writeKbTotal: number
  readKbPerSec: number
  writeKbPerSec: number
  readOpsPerSec: number
  writeOpsPerSec: number
  history: ThroughputPoint[]
}

// ─── Disk stats — /proc/diskstats (iotop/iostat backend view) ────────────────

export interface DiskStatSnapshot {
  capturedAt: number
  device: string        // "sda", "sdb", "nvme0n1", "md0", "dm-0"
  readsCompleted: number   // cumulative
  sectorsRead: number      // cumulative (1 sector = 512 B)
  writesCompleted: number  // cumulative
  sectorsWritten: number   // cumulative
  iosInProgress: number    // instantaneous
}

export interface DiskStatThroughput {
  device: string
  readKbPerSec: number
  writeKbPerSec: number
  readOpsPerSec: number
  writeOpsPerSec: number
  iosInProgress: number
  history: ThroughputPoint[]
}

// ─── Hardware (cf. SDD v2.3 §3) ──────────────────────────────────────────────

export interface SystemInfo {
  hostname: string
  uptime: number // secondes
  cpuModel: string
  cpuCores: number
  loadAvg: [number, number, number] // 1m, 5m, 15m
  cpuUsagePct: number // % calculé depuis /proc/stat
}

export interface MemoryInfo {
  totalKb: number
  availableKb: number
  usedKb: number
  buffersKb: number
  cachedKb: number
  usedPct: number // (total - available) / total * 100
}

export interface FCPort {
  host: string // "host0"
  portName: string // WWN "21:00:00:24:ff:91:60:bc"
  portState: 'Online' | 'Offline' | 'Link Down' | 'Unknown'
  speed: string // "8 Gbit"
  fabricName: string // WWN du switch
  symbolicName: string // description constructeur
  supportedSpeeds: string
  /** 'sysfs' = lu depuis /sys/class/fc_host, 'scst' = déduit de SCST sysfs */
  source?: 'sysfs' | 'scst'
}

export interface BlockDevice {
  name: string // "sda"
  size: string // "17.5T"
  sizeBytes: number
  type: 'disk' | 'part' | 'rom'
  mountpoint: string | null
  readOnly: boolean
  children?: BlockDevice[]
}

export interface VolumeUsage {
  mountpoint: string
  totalKb: number
  usedKb: number
  availableKb: number
  usedPct: number
}

export interface HardwareOverview {
  system: SystemInfo
  memory: MemoryInfo
  fcPorts: FCPort[]
  disks: BlockDevice[]
  volumes: VolumeUsage[]
  capturedAt: number
}

export function createEmptyHardwareOverview(): HardwareOverview {
  return {
    system: {
      hostname: '',
      uptime: 0,
      cpuModel: '',
      cpuCores: 0,
      loadAvg: [0, 0, 0],
      cpuUsagePct: 0,
    },
    memory: {
      totalKb: 0,
      availableKb: 0,
      usedKb: 0,
      buffersKb: 0,
      cachedKb: 0,
      usedPct: 0,
    },
    fcPorts: [],
    disks: [],
    volumes: [],
    capturedAt: Date.now(),
  }
}

// ─── Alertes passives (cf. SDD v2.3 §5) ──────────────────────────────────────

export type AlertLevel = 'warning' | 'error'

export interface Alert {
  id: string // identifiant stable pour déduplication
  level: AlertLevel
  title: string
  message: string
  source: string // "fc" | "volume" | "cpu" | "session"
  since: number // Date.now() de la 1ère détection (ou début grâce persistée pour session)
  /** Contexte structuré (optionnel) — seuils / multipathing. */
  meta?: {
    target?: string
    group?: string
    initiator?: string
    activeInitiatorCount?: number
    minRequired?: number
    pathCount?: number
    missingSinceMs?: number
  }
}

// ─── Dependency Tracker (SDD v3.2) ───────────────────────────────────────────

export type SemverDiff = 'major' | 'minor' | 'patch' | 'up-to-date' | 'unknown'
export type DepType = 'dependencies' | 'devDependencies'

export interface PackageDep {
  name: string
  installedVersion: string
  installedClean: string
  latestVersion: string
  diff: SemverDiff
  type: DepType
  publishedAt: string | null
  npmUrl: string
  repoUrl: string | null
  description: string
}

export interface DependenciesReport {
  scannedAt: number
  totalCount: number
  outdated: number
  majorUpdates: number
  minorUpdates: number
  patchUpdates: number
  packages: PackageDep[]
}

// ─── ESOS Version Tracker (SDD v3.3) ─────────────────────────────────────────

export type ESOSBuildType = 'stable' | 'master' | 'unknown'

export interface BuildOption {
  flag:        string
  description: string
}

export interface InstalledESOSVersion {
  raw:         string
  buildType:   ESOSBuildType
  version?:    string
  branch?:     string
  commitHash?: string
  buildOpts?:  BuildOption[]
}

export interface GitHubTag {
  name:        string
  sha:         string
  publishedAt: string | null
  zipUrl:      string
  tarUrl:      string
  downloadUrl: string
}

export type ESOSVersionDiff = 'up-to-date' | 'patch' | 'minor' | 'major' | 'on-master' | 'unknown'

export interface ESOSVersionReport {
  scannedAt:    number
  installed:    InstalledESOSVersion
  latestStable: GitHubTag | null
  allTags:      GitHubTag[]
  diff:         ESOSVersionDiff
  behindCount:  number
}

// ─── Cluster Mode (SDD v3.4) ─────────────────────────────────────────────────

export type ClusterNodeRole    = 'primary' | 'secondary'
export type PacemakerNodeState = 'Online' | 'Offline' | 'Standby' | 'Unknown'
export type ResourceState      = 'Started' | 'Stopped' | 'Master' | 'Slave' | 'Unknown'
export type ALUAState          = 'active' | 'nonoptimized' | 'standby' | 'unavailable' | 'unknown'

export interface ClusterNodeStatus {
  nodeId:             string
  hostname:           string
  host:               string
  role:               ClusterNodeRole
  clusterName:        string
  corosyncEnabled:    boolean
  corosyncRunning:    boolean
  pacemakerEnabled:   boolean
  pacemakerRunning:   boolean
  pacemakerNodeState: PacemakerNodeState
  quorate:            boolean
  resources:          ClusterResource[]
  aluaGroups:         ALUAGroup[]
  drbd:               import('./parsers/drbd.parser').DRBDStatus
  sshReady:           boolean
  lastChecked:        number
}

export interface ClusterResource {
  id:      string
  type:    string
  state:   ResourceState
  node:    string
  managed: boolean
  active?: boolean
}

export interface ALUAGroup {
  deviceGroup: string
  targetGroup: string
  groupId:     number
  state:       ALUAState
  targets:     string[]
}

export interface ClusterOverview {
  nodes:        ClusterNodeStatus[]
  mode:         'active-passive' | 'active-active' | 'unconfigured' | 'degraded' | 'resyncing' | 'split-brain'
  healthy:      boolean
  scannedAt:    number
  clusterId?:   string
  clusterName?: string
}

// ─── System Inventory (SDD v3.5) ─────────────────────────────────────────────

export interface SystemIdentity {
  manufacturer: string
  productName:  string
  version:      string
  serialNumber: string
  uuid:         string
  sku?:         string
  family?:      string
}

export interface BIOSInfo {
  vendor:            string
  version:           string
  releaseDate:       string
  revision?:         string
  firmwareRevision?: string
}

export interface BaseBoardInfo {
  manufacturer: string
  product:      string
  version:      string
  serialNumber: string
}

export interface CPUInfo {
  modelName:      string
  architecture:   string
  physicalCores:  number
  logicalCores:   number
  sockets:        number
  coresPerSocket: number
  threadsPerCore: number
  maxMhz:         number
  minMhz:         number
  currentMhz:     number[]
  l1dCache:       string
  l1iCache:       string
  l2Cache:        string
  l3Cache:        string
  flags:          string[]
  numaNodes:      number
  usagePct:       number
}

export interface MemoryOverview {
  totalKb:     number
  usedKb:      number
  freeKb:      number
  availableKb: number
  swapTotalKb: number
  swapUsedKb:  number
  usedPct:     number
}

export interface MemoryModule {
  locator:         string
  bankLocator:     string
  size:            number   // MB
  type:            string
  speed:           number   // MT/s
  manufacturer:    string
  serialNumber:    string
  partNumber:      string
  formFactor:      string
  configuredSpeed: number
  empty:           boolean
}

export type DiskType = 'HDD' | 'SSD' | 'NVMe' | 'Unknown'

export interface SmartAttribute {
  id:         number
  name:       string
  rawValue:   string
  worstValue: number
  threshold:  number
  failing:    boolean
}

export interface SmartInfo {
  available:           boolean
  enabled:             boolean
  health:              'PASSED' | 'FAILED' | 'UNKNOWN'
  temperature:         number | null
  powerOnHours:        number | null
  reallocatedSectors:  number | null
  pendingSectors:      number | null
  uncorrectableErrors: number | null
  smartAttributes:     SmartAttribute[]
}

export interface DiskDevice {
  name:       string
  sizeBytes:  number
  type:       DiskType
  model:      string
  serial:     string
  vendor:     string
  transport:  string
  rotational: boolean
  mountpoint: string | null
  state:      string
  smart?:     SmartInfo
}

export interface RAIDMember {
  disk:  string
  state: string
}

export interface SoftRAID {
  device:   string
  level:    string
  state:    string
  size:     number   // KB
  members:  RAIDMember[]
  resync?:  { action: string; pct: number; speed: string }
}

export interface NetworkAddress {
  address:   string
  prefixLen: number
  family:    'inet' | 'inet6'
}

export interface NetworkInterface {
  name:       string
  macAddress: string
  state:      'up' | 'down' | 'unknown'
  mtu:        number
  speed:      number | null   // Mbps
  duplex:     string | null
  addresses:  NetworkAddress[]
  driver:     string | null
  isBond:     boolean
  bondSlaves: string[]
}

export interface PCIDevice {
  slot:     string
  class:    string
  vendor:   string
  device:   string
  svVendor: string
  svDevice: string
}

export interface IPMISensor {
  name:  string
  value: string
  unit:  string
  state: 'ok' | 'warning' | 'critical' | 'unknown'
}

export interface IPMIInfo {
  available:     boolean
  temperatures:  IPMISensor[]
  fans:          IPMISensor[]
  powerSupplies: IPMISensor[]
}

export interface SystemInventory {
  sanId:      string
  scannedAt:  number
  hostname:   string
  osVersion:  string
  kernel:     string
  uptime:     number
  loadAvg:    [number, number, number]
  system:     SystemIdentity
  bios:       BIOSInfo
  baseBoard:  BaseBoardInfo
  cpu:        CPUInfo
  memory:     MemoryOverview
  memModules: MemoryModule[]
  disks:      DiskDevice[]
  raids:      SoftRAID[]
  network:    NetworkInterface[]
  pci:        PCIDevice[]
  ipmi:       IPMIInfo
}

// ─── System Configuration (SDD v3.6) ─────────────────────────────────────────

export interface HostnameConfig {
  hostname: string
  domain:   string
  fqdn:     string
}

export interface DateTimeConfig {
  timezone:    string
  currentTime: string
  ntpEnabled:  boolean
  ntpServers:  string[]
  ntpRunning:  boolean
}

export interface NetworkInterfaceConfig {
  index:       number
  ifname:      string
  useDHCP:     boolean
  ipAddress:   string
  netmask:     string
  broadcast:   string
  mtu:         number | null
  dhcpTimeout: number
  currentIp?:  string
  state?:      'up' | 'down'
}

export interface NetworkGeneralConfig {
  gateway:      string
  nameservers:  string[]
  searchDomain: string
  interfaces:   NetworkInterfaceConfig[]
}

export interface SMTPConfig {
  alertEmail:   string
  mailHub:      string
  authUser:     string
  authPass:     string
  useTLS:       boolean
  useSTARTTLS:  boolean
  authMethod:   'LOGIN' | 'PLAIN' | 'CRAM-MD5' | ''
  fromOverride: boolean
}

export interface SystemConfigSnapshot {
  sanId:     string
  scannedAt: number
  hostname:  HostnameConfig
  dateTime:  DateTimeConfig
  network:   NetworkGeneralConfig
  smtp:      Omit<SMTPConfig, 'authPass'>
}

// ─── System Configuration v2 : Réponse structurée (SDD v3.6.1) ──────────────

import type { SSHStatus } from './ssh-session-manager'

export type ConfigSectionStatus = 'ok' | 'error' | 'unavailable'

export interface ConfigSectionResult<T> {
  data:   T | null
  status: ConfigSectionStatus
  error?: {
    code:    string
    message: string
  }
}

export interface SystemConfigResponse {
  sanId:     string
  scannedAt: number
  sshStatus: SSHStatus
  hostname:  ConfigSectionResult<HostnameConfig>
  dateTime:  ConfigSectionResult<DateTimeConfig>
  network:   ConfigSectionResult<NetworkGeneralConfig>
  smtp:      ConfigSectionResult<Omit<SMTPConfig, 'authPass'>>
}

