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
  result.raidDevices = parseInt(kv('Raid Devices') ?? '', 10) || undefined
  result.totalDevices = parseInt(kv('Total Devices') ?? '', 10) || undefined
  result.activeDevices = parseInt(kv('Active Devices') ?? '', 10) || undefined
  result.workingDevices = parseInt(kv('Working Devices') ?? '', 10) || undefined
  result.failedDevices = parseInt(kv('Failed Devices') ?? '', 10) || undefined
  result.spareDevices = parseInt(kv('Spare Devices') ?? '', 10) || undefined

  const chunkStr = kv('Chunk Size')
  if (chunkStr) {
    const m = chunkStr.match(/(\d+)\s*K/i)
    if (m) result.chunkKb = parseInt(m[1], 10)
  }

  const sizeStr = kv('Array Size')
  if (sizeStr) {
    const m = sizeStr.match(/(\d+)\s*\(/i) ?? sizeStr.match(/(\d+)/)
    if (m) result.sizeBytes = parseInt(m[1], 10) * 1024
  }

  // Parse member device rows. Removed slots may not include a path.
  const rowPattern = /^\s+(-|\d+)\s+(\d+)\s+(\d+)\s+(-|\d+)\s+(.+?)\s*$/gm
  let m: RegExpExecArray | null
  while ((m = rowPattern.exec(output)) !== null) {
    const slot = m[1] === '-' ? undefined : parseInt(m[1], 10)
    const major = parseInt(m[2], 10)
    const minor = parseInt(m[3], 10)
    const raidDevice = m[4] === '-' ? undefined : parseInt(m[4], 10)
    const tail = m[5].trim()
    const pathMatch = tail.match(/\s(\/dev\/\S+)$/)
    const path = pathMatch?.[1]?.trim()
    const stateStr = (path ? tail.slice(0, -path.length) : tail).trim().toLowerCase()

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
