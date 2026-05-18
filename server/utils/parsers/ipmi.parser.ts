import type { IPMISensor, IPMIInfo } from '../types'

/**
 * Parse `ipmitool sensor` output (10 pipe-separated fields, fully decoded values).
 * Format: name | value | unit | state | lnr | lc | lnc | unc | uc | unr
 * Categorises into temperatures / fans / powerSupplies by unit.
 */
export function parseIPMIAll(output: string): IPMIInfo {
  const unavailable = !output || output.includes('IPMI_UNAVAILABLE')
  if (unavailable) {
    return { available: false, temperatures: [], fans: [], powerSupplies: [] }
  }

  const temperatures: IPMISensor[] = []
  const fans:         IPMISensor[] = []
  const powerSupplies: IPMISensor[] = []

  for (const line of output.split('\n')) {
    const parts = line.split('|').map(p => p.trim())
    // ipmitool sensor gives 10 fields; ipmitool sdr gives fewer — accept ≥4
    if (parts.length < 4) continue

    const name     = parts[0]
    const rawValue = parts[1] ?? ''
    const rawUnit  = parts[2] ?? ''
    const stateRaw = parts[3] ?? ''

    if (!name) continue

    // Skip discrete / no-reading sensors
    if (
      rawValue === 'na' ||
      rawValue === 'No Reading' ||
      rawValue === 'Disabled' ||
      /^0x[0-9a-f]+$/i.test(rawValue) ||
      rawUnit.toLowerCase() === 'discrete'
    ) continue

    // Normalise unit
    let unit = rawUnit
    if (unit.toLowerCase() === 'degrees c') unit = '°C'
    else if (unit.toLowerCase() === 'degrees f') unit = '°F'

    // Format numeric value: trim trailing zeros (24.000 → 24, 4800.000 → 4800)
    const num = parseFloat(rawValue)
    const value = !isNaN(num)
      ? (num % 1 === 0 ? num.toFixed(0) : num.toFixed(1))
      : rawValue

    const state: IPMISensor['state'] =
      stateRaw.toLowerCase() === 'ok'       ? 'ok'       :
      stateRaw.toLowerCase() === 'warning'  ? 'warning'  :
      stateRaw.toLowerCase() === 'critical' ? 'critical' : 'unknown'

    const sensor: IPMISensor = { name, value, unit, state }
    const unitLower = unit.toLowerCase()

    if (unitLower === '°c' || unitLower === '°f' || unitLower === 'degrees c') {
      temperatures.push(sensor)
    } else if (unitLower === 'rpm') {
      fans.push(sensor)
    } else if (
      unitLower === 'watts' ||
      unitLower === 'amps'  ||
      unitLower === 'volts' ||
      name.toLowerCase().includes('psu') ||
      name.toLowerCase().includes('power supply') ||
      name.toLowerCase().includes('redundancy')
    ) {
      powerSupplies.push(sensor)
    }
    // Voltage / other sensor types are intentionally omitted from the three panels
  }

  return { available: true, temperatures, fans, powerSupplies }
}

/** @deprecated Use parseIPMIAll instead */
export function parseIPMISensors(output: string): IPMISensor[] {
  return parseIPMIAll(output).temperatures
}

/** Parse ethtool output for a single interface. */
export function parseEthtoolOutput(output: string): { speed: number | null; duplex: string | null; driver: string | null } {
  if (!output || output.includes('ETHTOOL_UNAVAILABLE')) {
    return { speed: null, duplex: null, driver: null }
  }

  const speedMatch  = /Speed:\s+(\d+)Mb\/s/.exec(output)
  const duplexMatch = /Duplex:\s+(\w+)/.exec(output)
  const driverMatch = /driver:\s+(\S+)/.exec(output)

  return {
    speed:  speedMatch  ? parseInt(speedMatch[1], 10)      : null,
    duplex: duplexMatch ? duplexMatch[1].toLowerCase()     : null,
    driver: driverMatch ? driverMatch[1]                   : null,
  }
}

/** Parse a bulk ethtool output: ===ETHTOOL_eth0=== ... ===ETHTOOL_eth1=== ... */
export function parseEthtoolBulk(
  output: string,
  ifaces: string[],
): Map<string, { speed: number | null; duplex: string | null; driver: string | null }> {
  const result = new Map<string, { speed: number | null; duplex: string | null; driver: string | null }>()
  const parts  = output.split(/^===ETHTOOL_(\S+)===/m)

  for (let i = 1; i < parts.length; i += 2) {
    const iface   = parts[i]
    const section = parts[i + 1] ?? ''
    if (ifaces.includes(iface)) {
      result.set(iface, parseEthtoolOutput(section))
    }
  }

  return result
}
