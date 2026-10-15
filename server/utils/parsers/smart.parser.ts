import type { SmartInfo, SmartAttribute } from '../types'

export function parseSmartOutput(output: string): SmartInfo {
  if (output.includes('SMART_UNAVAILABLE') || output.includes('Permission denied')) {
    return {
      available: false, enabled: false, health: 'UNKNOWN',
      temperature: null, powerOnHours: null,
      reallocatedSectors: null, pendingSectors: null,
      uncorrectableErrors: null, smartAttributes: [],
    }
  }

  const health = /SMART overall-health self-assessment test result:\s*(\w+)/.exec(output)?.[1] ?? 'UNKNOWN'

  // ATA attribute table
  const attrs: SmartAttribute[] = []
  // Format: ID# NAME FLAG VALUE WORST THRESH TYPE UPDATED WHEN_FAILED RAW_VALUE
  const attrPattern = /^\s*(\d+)\s+([\w_]+)\s+\S+\s+(\d+)\s+(\d+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(\S+)/gm
  let m: RegExpExecArray | null
  while ((m = attrPattern.exec(output)) !== null) {
    const [, id, name, , worst, threshold, rawValue] = m
    attrs.push({
      id:         Number.parseInt(id, 10),
      name,
      rawValue:   rawValue.split(' ')[0],
      worstValue: Number.parseInt(worst, 10),
      threshold:  Number.parseInt(threshold, 10),
      failing:    Number.parseInt(worst, 10) <= Number.parseInt(threshold, 10),
    })
  }

  const findAttr = (id: number) => attrs.find(a => a.id === id)

  const tempAttr    = findAttr(194) ?? findAttr(190)
  const temperature = tempAttr ? Number.parseInt(tempAttr.rawValue, 10) : parseNvmeTemp(output)

  const pohAttr     = findAttr(9)
  const powerOnHours = pohAttr
    ? Number.parseInt(pohAttr.rawValue.replace(/[^\d]/g, ''), 10)
    : parseNvmePOH(output)

  return {
    available:           true,
    enabled:             output.includes('SMART Enabled') || output.includes('SMART support is: Enabled'),
    health:              health === 'PASSED' ? 'PASSED' : health === 'FAILED' ? 'FAILED' : 'UNKNOWN',
    temperature,
    powerOnHours,
    reallocatedSectors:  Number.parseInt(findAttr(5)?.rawValue   ?? '0', 10) || null,
    pendingSectors:      Number.parseInt(findAttr(197)?.rawValue  ?? '0', 10) || null,
    uncorrectableErrors: Number.parseInt(findAttr(198)?.rawValue  ?? '0', 10) || null,
    smartAttributes:     attrs,
  }
}

/** Parse NVMe temperature from smartctl -A output ("Temperature:  35 Celsius") */
function parseNvmeTemp(output: string): number | null {
  const m = /Temperature(?:\s+Sensor\s+1)?:\s+(\d+)\s+Celsius/.exec(output)
  return m ? Number.parseInt(m[1], 10) : null
}

/** Parse NVMe Power On Hours from smartctl -A output */
function parseNvmePOH(output: string): number | null {
  const m = /Power On Hours:\s+([\d,]+)/.exec(output)
  return m ? Number.parseInt(m[1].replace(/,/g, ''), 10) : null
}

/** Parse a bulk SMART output containing multiple ===SMART_sdX=== sections. */
export function parseSmartBulk(output: string, diskNames: string[]): Map<string, SmartInfo> {
  const result = new Map<string, SmartInfo>()
  const parts = output.split(/^===SMART_([a-zA-Z0-9]+)===/m)

  for (let i = 1; i < parts.length; i += 2) {
    const diskName = parts[i]
    const section  = parts[i + 1] ?? ''
    if (diskNames.includes(diskName)) {
      result.set(diskName, parseSmartOutput(section))
    }
  }

  // Ensure all requested disks have an entry (unavailable if not parsed)
  for (const name of diskNames) {
    if (!result.has(name)) {
      result.set(name, {
        available: false, enabled: false, health: 'UNKNOWN',
        temperature: null, powerOnHours: null,
        reallocatedSectors: null, pendingSectors: null,
        uncorrectableErrors: null, smartAttributes: [],
      })
    }
  }

  return result
}
