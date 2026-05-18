/**
 * Parser pour mdadm --detail --scan.
 */
export interface MdadmScanEntry {
  path: string
  name: string
  uuid?: string
  metadataVersion?: string
  containerName?: string
  scanLine: string
}

export function parseMdadmScanLines(scan: string): MdadmScanEntry[] {
  const entries: MdadmScanEntry[] = []
  for (const line of scan.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('ARRAY ')) continue
    const pathMatch = trimmed.match(/^ARRAY\s+(\/dev\/\S+)/)
    if (!pathMatch) continue
    const path = pathMatch[1]
    const name = path.replace(/^\/dev\//, '')
    const uuid = trimmed.match(/UUID=([0-9a-f:]+)/i)?.[1]
    const metadataVersion = trimmed.match(/metadata=([^\s]+)/i)?.[1]
    const containerName = trimmed.match(/name=([^\s]+)/i)?.[1]
    entries.push({
      path,
      name,
      uuid,
      metadataVersion,
      containerName,
      scanLine: trimmed,
    })
  }
  return entries
}
