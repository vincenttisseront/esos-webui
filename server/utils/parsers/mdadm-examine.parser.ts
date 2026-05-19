/**
 * Parser pour la sortie de mdadm --examine (superblock sur partition).
 */
import type { MdExamineInfo } from '../raid-types'

export function parseExamineValue(output: string, key: string): string | undefined {
  const m = output.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'mi'))
  return m?.[1].trim()
}

/** True when examine output describes a real MD superblock (not bare Magic / ambiguous data). */
export function isValidMdSuperblockInfo(info: MdExamineInfo | undefined): boolean {
  if (!info) return false
  if (info.uuid?.trim()) return true
  if (info.raidLevel?.trim()) return true
  if (info.raidDevices != null && info.raidDevices > 0) return true
  const name = info.name?.trim()
  if (name && /^[^:]+:md[a-z0-9_-]{0,15}$/i.test(name)) return true
  return false
}

export function isMdSuperblockDetected(stdout: string): boolean {
  const trimmed = stdout.trim()
  if (!trimmed || /No md superblock detected/i.test(trimmed)) return false
  return isValidMdSuperblockInfo(parseMdadmExamineOutput(trimmed))
}

export function parseMdadmExamineOutput(raw: string): MdExamineInfo | undefined {
  const trimmed = raw.trim()
  if (!trimmed || /No md superblock detected/i.test(trimmed)) return undefined
  const info: MdExamineInfo = {
    uuid: parseExamineValue(trimmed, 'Array UUID') ?? parseExamineValue(trimmed, 'UUID'),
    name: parseExamineValue(trimmed, 'Name'),
    raidLevel: parseExamineValue(trimmed, 'Raid Level')?.replace(/^raid/i, ''),
    raidDevices: parseInt(parseExamineValue(trimmed, 'Raid Devices') ?? '', 10) || undefined,
    events: parseInt(parseExamineValue(trimmed, 'Events') ?? '', 10) || undefined,
    state: parseExamineValue(trimmed, 'State')?.toLowerCase(),
    raw: trimmed.slice(0, 2000),
  }
  return isValidMdSuperblockInfo(info) ? info : undefined
}

export function parseMdadmExamineBulk(output: string): Map<string, MdExamineInfo> {
  const map = new Map<string, MdExamineInfo>()
  let current: string | undefined
  let buffer: string[] = []

  const flush = () => {
    if (!current) return
    const info = parseMdadmExamineOutput(buffer.join('\n'))
    if (info && isValidMdSuperblockInfo(info)) map.set(current, info)
  }

  for (const line of output.split('\n')) {
    const marker = line.match(/^---DEVICE\s+(.+)---$/)
    if (marker) {
      flush()
      current = marker[1].trim()
      buffer = []
      continue
    }
    buffer.push(line)
  }
  flush()

  return map
}
