export interface MapLunPayload {
  lunId: number
  deviceName: string
  readOnly?: boolean
}

export interface UnmappedDeviceInfo {
  name: string
  handler: string
  filename: string
}

export interface ScstPreflightResult {
  ok: boolean
  configPreview: string[]
  warnings: string[]
  blockers: string[]
  message?: string
  /** Typed confirmation phrase for destructive group delete. */
  requiredConfirmation?: string
}

export interface ScstGroupLunRef {
  lunId: number
  deviceName: string
  handler: string
  filename: string
  readOnly: boolean
}

export interface ScstAccessGroupRef {
  name: string
  initiators: string[]
  luns: ScstGroupLunRef[]
}

export interface ScstTargetAccessRef {
  name: string
  driver: string
  enabled: boolean
  hwTarget: boolean
  groups: ScstAccessGroupRef[]
  /** LUNs mapped directly on TARGET (no GROUP), e.g. copy_manager */
  targetLuns: ScstGroupLunRef[]
  sessionCount: number
}

/** Read-only SCST access-control tree: target → groups → initiators → LUNs. */
export interface ScstAccessControlOverview {
  scannedAt: number
  targets: ScstTargetAccessRef[]
  unmappedDevices: UnmappedDeviceInfo[]
}

export interface DeviceMappingRef {
  targetName: string
  /** Empty when LUN is mapped directly on TARGET (no GROUP). */
  groupName: string
  lunId: number
}
