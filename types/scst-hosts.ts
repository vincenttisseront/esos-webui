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
}
