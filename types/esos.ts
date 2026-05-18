/**
 * Domain types for ESOS / SCST configuration.
 * Source of truth — imported by both server utils and frontend pages.
 * Mirrors SDD v1.2 rev.1 §6.
 */

export interface ScstConfig {
  handlers: Handler[]
  drivers: Driver[]
}

export interface Handler {
  name: string
  devices: Device[]
}

export interface Device {
  name: string
  handler: string
  filename: string
  attrs: Record<string, string>
}

export interface Driver {
  name: string
  /** Driver-level `enabled 0/1` (rev.1 D5). Default true if absent. */
  enabled: boolean
  targets: Target[]
}

export interface Target {
  /** WWN (FC) or IQN (iSCSI) — opaque string identifier. */
  name: string
  driver: string
  enabled: boolean
  /** `HW_TARGET` flag (rev.1 D2). */
  hwTarget: boolean
  /** Generic target attributes — `rel_tgt_id`, etc. (rev.1 D3). */
  attrs: Record<string, string>
  groups: Group[]
  /** LUNs declared directly under TARGET, without GROUP (rev.1 D4). */
  luns: Lun[]
  sessions: Session[]
}

export interface Group {
  name: string
  /** WWN (FC) or IQN (iSCSI) (rev.1 D6). */
  initiators: string[]
  luns: Lun[]
}

export interface Lun {
  id: number
  device: string
  readOnly: boolean
  attrs: Record<string, string>
}

export interface Session {
  /** WWN in FC, IQN in iSCSI. */
  initiatorName: string
  /** WWN in FC, IQN in iSCSI. */
  target: string
  /** Driver name — identifies the transport (rev.1). */
  driver: string
  /** Empty in FC (rev.1 H4). */
  ipAddr: string
  sid: string
}

/** SCST-internal drivers excluded from the main UI (rev.1 D7). */
export const SYSTEM_DRIVERS = ['copy_manager'] as const
export type SystemDriverName = (typeof SYSTEM_DRIVERS)[number]

export function isSystemDriver(name: string): boolean {
  return (SYSTEM_DRIVERS as readonly string[]).includes(name)
}

export interface Overview {
  stats: {
    /** Excludes drivers in SYSTEM_DRIVERS. */
    targets: number
    devices: number
    sessions: number
    groups: number
    /** Sum of group-LUNs and direct target-LUNs. */
    luns: number
  }
  /** Targets from non-system drivers. */
  targets: Target[]
  /** Targets from system drivers (copy_manager, ...). */
  systemTargets: Target[]
  devices: Device[]
  sessions: Session[]
}

export function createEmptyOverview(): Overview {
  return {
    stats: {
      targets: 0,
      devices: 0,
      sessions: 0,
      groups: 0,
      luns: 0,
    },
    targets: [],
    systemTargets: [],
    devices: [],
    sessions: [],
  }
}
