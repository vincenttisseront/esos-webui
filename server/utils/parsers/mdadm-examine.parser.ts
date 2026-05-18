/**
 * Parser pour la sortie de mdadm --examine (superblock sur partition).
 */
import type { MdExamineInfo } from '../raid-types'

export function parseExamineValue(output: string, key: string): string | undefined {
  const m = output.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'mi'))
  return m?.[1].trim()
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
  if (info.uuid || info.name || /Magic|superblock/i.test(trimmed)) return info
  return undefined
}

export function parseMdadmExamineBulk(output: string): Map<string, MdExamineInfo> {
  const map = new Map<string, MdExamineInfo>()
  let current: string | undefined
  let buffer: string[] = []

  const flush = () => {
    if (!current) return
    const info = parseMdadmExamineOutput(buffer.join('\n'))
    if (info) map.set(current, info)
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
