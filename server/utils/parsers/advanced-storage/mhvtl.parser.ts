import type { MhvtlDevice } from '../../../../types/advanced-storage'

export function parseMhvtlSection(raw: string): { devices: MhvtlDevice[]; configPresent: boolean } {
  const devices: MhvtlDevice[] = []
  let configPresent = false

  if (raw.includes('CONFIG_PRESENT=1') || raw.includes('devices.conf')) {
    configPresent = true
  }

  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (t.startsWith('DEVICE ')) {
      devices.push({ name: t.slice(7).trim() })
    }
    if (t.startsWith('/dev/')) {
      devices.push({ name: t.split('/').pop() ?? t, path: t })
    }
  }

  return { devices, configPresent }
}
