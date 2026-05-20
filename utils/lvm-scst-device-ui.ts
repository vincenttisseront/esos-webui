/** Client-side SCST blockio device name rules (aligned with server preflight). */
export const SCST_DEVICE_NAME_MAX_LEN = 32
export const SCST_DEVICE_NAME_RE = /^[A-Za-z0-9_-]+$/

export type ScstDeviceNameValidationError = 'empty' | 'invalid' | 'too_long'

export function validateScstDeviceName(name: string): ScstDeviceNameValidationError | null {
  const trimmed = name.trim()
  if (!trimmed) return 'empty'
  if (trimmed.length > SCST_DEVICE_NAME_MAX_LEN) return 'too_long'
  if (!SCST_DEVICE_NAME_RE.test(trimmed)) return 'invalid'
  return null
}

export function buildScstRegisterPreview(deviceName: string, lvPath: string): string {
  const dev = deviceName.trim()
  const path = lvPath.trim()
  return `scst_register vdisk_blockio ${dev} ${path}`
}

export function suggestedScstDeviceName(vgName: string, lvName: string): string {
  const raw = `lv_${vgName}_${lvName}`.replace(/[^A-Za-z0-9_-]/g, '_')
  return raw.slice(0, SCST_DEVICE_NAME_MAX_LEN)
}
