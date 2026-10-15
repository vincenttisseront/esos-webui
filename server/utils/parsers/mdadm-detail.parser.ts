/**
 * Parser pour `mdadm --detail /dev/mdX` (SDD v3.12 §6.2).
 */
import type { MdMemberDevice } from '../raid-types'

export interface MdDetail {
  uuid?: string
  name?: string
  metadataVersion?: string
  state?: string
  raidLevel?: string
  raidDevices?: number
  totalDevices?: number
  activeDevices?: number
  workingDevices?: number
  failedDevices?: number
  spareDevices?: number
  chunkKb?: number
  sizeBytes?: number
  members: MdMemberDevice[]
}

/**
 * Parse la sortie de `mdadm --detail /dev/mdX`.
 */
export function parseMdadmDetail(output: string): MdDetail {
  const result: MdDetail = { members: [] }

  const kv = (key: string): string | undefined => {
    const m = output.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'mi'))
    return m?.[1].trim()
  }

  result.uuid = kv('UUID')
  result.name = kv('Name')
  result.metadataVersion = kv('Version')
  result.state = kv('State')?.toLowerCase()
  result.raidLevel = kv('Raid Level')?.replace('raid', '')
  result.raidDevices = Number.parseInt(kv('Raid Devices') ?? '', 10) || undefined
  result.totalDevices = Number.parseInt(kv('Total Devices') ?? '', 10) || undefined
  result.activeDevices = Number.parseInt(kv('Active Devices') ?? '', 10) || undefined
  result.workingDevices = Number.parseInt(kv('Working Devices') ?? '', 10) || undefined
  result.failedDevices = Number.parseInt(kv('Failed Devices') ?? '', 10) || undefined
  result.spareDevices = Number.parseInt(kv('Spare Devices') ?? '', 10) || undefined

  const chunkStr = kv('Chunk Size')
  if (chunkStr) {
    const kIdx = chunkStr.toUpperCase().indexOf('K')
    const numPart = (kIdx >= 0 ? chunkStr.slice(0, kIdx) : chunkStr).trim()
    const n = Number.parseInt(numPart, 10)
    if (!Number.isNaN(n)) result.chunkKb = n
  }

  const sizeStr = kv('Array Size')
  if (sizeStr) {
    const paren = sizeStr.indexOf('(')
    const numPart = (paren >= 0 ? sizeStr.slice(0, paren) : sizeStr).trim().split(/\s+/)[0] ?? ''
    const n = Number.parseInt(numPart, 10)
    if (!Number.isNaN(n)) result.sizeBytes = n * 1024
  }

  // Parse member device rows. Removed slots may not include a path.
  for (const line of output.split('\n')) {
    const trimmed = line.trimEnd()
    if (!/^\s+(-|\d+)\s+\d+\s+\d+\s+(-|\d+)\s+/.test(trimmed)) continue
    const parts = trimmed.trim().split(/\s+/)
    if (parts.length < 5) continue
    const slot = parts[0] === '-' ? undefined : Number.parseInt(parts[0]!, 10)
    const major = Number.parseInt(parts[1]!, 10)
    const minor = Number.parseInt(parts[2]!, 10)
    const raidDevice = parts[3] === '-' ? undefined : Number.parseInt(parts[3]!, 10)
    const pathIdx = parts.findIndex(p => p.startsWith('/dev/'))
    const path = pathIdx >= 0 ? parts[pathIdx] : undefined
    const stateStr = (pathIdx >= 0 ? parts.slice(4, pathIdx) : parts.slice(4)).join(' ').trim().toLowerCase()

    const state: MdMemberDevice['state'] = []
    if (stateStr.includes('active')) state.push('active')
    if (stateStr.includes('sync')) state.push('sync')
    if (stateStr.includes('faulty')) state.push('faulty')
    if (stateStr.includes('spare')) state.push('spare')
    if (stateStr.includes('rebuilding')) state.push('rebuilding')
    if (stateStr.includes('removed')) state.push('removed')
    if (state.length === 0) state.push('active')

    result.members.push({
      path,
      role: raidDevice,
      slot,
      major,
      minor,
      raidDevice,
      arrayUuid: result.uuid,
      state,
    })
  }

  return result
}
