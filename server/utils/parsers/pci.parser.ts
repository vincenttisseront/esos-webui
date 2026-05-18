import type { PCIDevice } from '../types'

const INTERESTING_CLASSES = [
  'RAID bus controller',
  'SCSI storage controller',
  'Fibre Channel',
  'Serial Attached SCSI controller',
  'Non-Volatile memory controller',
  'Ethernet controller',
  'Network controller',
]

export function parseLSPCI(output: string): PCIDevice[] {
  const devices: PCIDevice[] = []
  const blocks = output.split('\n\n').filter(Boolean)

  for (const block of blocks) {
    const kv = new Map<string, string>()
    for (const line of block.split('\n')) {
      const tabIdx = line.indexOf('\t')
      if (tabIdx === -1) continue
      kv.set(line.slice(0, tabIdx).trim(), line.slice(tabIdx + 1).trim())
    }

    const cls = kv.get('Class') ?? ''
    if (!INTERESTING_CLASSES.some(c => cls.includes(c))) continue

    devices.push({
      slot:     kv.get('Slot')    ?? '',
      class:    cls,
      vendor:   kv.get('Vendor')  ?? '',
      device:   kv.get('Device')  ?? '',
      svVendor: kv.get('SVendor') ?? '',
      svDevice: kv.get('SDevice') ?? '',
    })
  }

  return devices
}
