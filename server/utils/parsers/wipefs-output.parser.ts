/**
 * Parse wipefs probe output (single device or bulk overview format).
 */

export function parseWipefsProbeOutput(output: string): string[] {
  const signatures: string[] = []
  const trimmed = output.trim()
  if (!trimmed) return signatures

  // Bulk format: ---DEVICE /dev/sda1---
  if (trimmed.includes('---DEVICE')) {
    let current: string | undefined
    let typeIndex = 2
    for (const line of trimmed.split('\n')) {
      const marker = line.match(/^---DEVICE\s+(.+)---$/)
      if (marker) {
        current = marker[1].trim()
        typeIndex = 2
        continue
      }
      if (!current) continue
      const columns = line.trim().split(/\s+/)
      const headerTypeIndex = columns.findIndex(c => c.toLowerCase() === 'type')
      if (headerTypeIndex >= 0) {
        typeIndex = headerTypeIndex
        continue
      }
      const type = columns[typeIndex]
      if (type && !signatures.includes(type)) signatures.push(type)
    }
    return signatures
  }

  // Single-device wipefs -n lines: offset type ...
  let typeIndex = 2
  for (const line of trimmed.split('\n')) {
    const columns = line.trim().split(/\s+/)
    if (!columns.length) continue
    const headerTypeIndex = columns.findIndex(c => c.toLowerCase() === 'type')
    if (headerTypeIndex >= 0) {
      typeIndex = headerTypeIndex
      continue
    }
    const type = columns[typeIndex]
    if (type && /^[a-z0-9_-]+$/i.test(type) && !signatures.includes(type)) {
      signatures.push(type)
    }
  }
  return signatures
}

export function parseBlkidTypes(output: string): string[] {
  const types: string[] = []
  for (const line of output.split('\n')) {
    const typeMatch = line.match(/TYPE="([^"]+)"/)
    if (typeMatch && !types.includes(typeMatch[1])) types.push(typeMatch[1])
  }
  return types
}
