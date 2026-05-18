import type { DiskDevice, DiskType } from '../types'

export function parseLSBLK(output: string): Omit<DiskDevice, 'smart'>[] {
  const devices: Omit<DiskDevice, 'smart'>[] = []

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    const fields = parseKeyValueLine(line)
    if (!fields.NAME || fields.TYPE !== 'disk') continue

    const sizeBytes  = parseInt(fields.SIZE ?? '0', 10)
    const rotational = fields.ROTA === '1'
    const transport  = (fields.TRAN ?? '').toLowerCase()

    let diskType: DiskType = 'Unknown'
    if (transport === 'nvme')    diskType = 'NVMe'
    else if (!rotational)        diskType = 'SSD'
    else                         diskType = 'HDD'

    devices.push({
      name:       fields.NAME,
      sizeBytes,
      type:       diskType,
      model:      (fields.MODEL  ?? '').trim(),
      serial:     (fields.SERIAL ?? '').trim(),
      vendor:     (fields.VENDOR ?? '').trim(),
      transport,
      rotational,
      mountpoint: fields.MOUNTPOINT || null,
      state:      (fields.STATE ?? '').toLowerCase() || 'unknown',
    })
  }

  return devices
}

function parseKeyValueLine(line: string): Record<string, string> {
  const result: Record<string, string> = {}
  const pattern = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(line)) !== null) {
    result[m[1]] = m[2]
  }
  return result
}
