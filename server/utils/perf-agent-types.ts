/**
 * Types partagés pour le module Performance Monitoring (SDD v3.10).
 */

// ─── Configuration ────────────────────────────────────────────────────────────

export interface PerfAgentConfig {
  dburiMasked: string
  dbType: 'postgres' | 'mysql' | 'unknown'
  dbHost: string
  dbName: string
  system: string
  hostAddress?: string
  pollingIntervalSec: number
  blockDevices: string[]
  rawExists: boolean
  updatedAt: number
}

export interface PerfAgentConfigUpdate {
  dburi?: string
  system: string
  hostAddress?: string
  pollingIntervalSec: number
  blockDevices: string[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface PerfAgentServiceStatus {
  enabledOnBoot: boolean
  running: boolean
  pid?: number
  uptimeSec?: number
  lastCheckedAt: number
  rawStatus: string
}

export type PerfServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable'

// ─── Métriques ────────────────────────────────────────────────────────────────

export interface PerfDeviceSample {
  timestamp: number
  system: string
  device: string
  readsCompleted: number
  readsMerged: number
  sectorsRead: number
  writesCompleted: number
  sectorsWritten: number
  kbRead: number
  kbWritten: number
  averageReadTimeMs: number
  averageWriteTimeMs: number
  ioTimeMs: number
  intervalSec: number
  writeSpeedKbps: number
  readSpeedKbps: number
  deviceRateKbps: number
}

export interface PerfDeviceSeries {
  system: string
  device: string
  window: '15m' | '1h' | '6h' | '24h' | '7d' | '31d'
  points: Array<{
    t: number
    readKbps: number
    writeKbps: number
    deviceRateKbps: number
    averageReadTimeMs: number
    averageWriteTimeMs: number
    readsCompleted: number
    writesCompleted: number
  }>
}

export interface PerfDeviceSummary {
  system: string
  device: string
  lastSampleAt: number
  readKbps: number
  writeKbps: number
  deviceRateKbps: number
  averageReadTimeMs: number
  averageWriteTimeMs: number
  readsCompleted: number
  writesCompleted: number
  status: 'idle' | 'active' | 'hot' | 'stale' | 'unknown'
}

// ─── DB ───────────────────────────────────────────────────────────────────────

export interface PerfDbTestResult {
  ok: boolean
  dbType: 'postgres' | 'mysql' | 'unknown'
  latencyMs?: number
  tables?: string[]
  sampleCount?: number
  oldestSampleAt?: number
  newestSampleAt?: number
  error?: string
}

export interface PerfAgentSchemaMapping {
  tableName: string
  timestampCol: string
  systemCol: string
  deviceCol: string
}

// ─── Block devices ────────────────────────────────────────────────────────────

export interface BlockDeviceInfo {
  name: string
  size: number
  type: string
  model?: string
  serial?: string
  vendor?: string
  rota: boolean
  tran?: string
  mountpoint?: string
  state?: string
  isSelected: boolean
  warning?: string
}
