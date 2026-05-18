import type { SystemIdentity, BIOSInfo, BaseBoardInfo, MemoryModule } from '../types'

type DMIRecord = Record<string, string>

function parseDMIBlock(block: string): DMIRecord {
  const result: DMIRecord = {}
  for (const line of block.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key   = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key && value && value !== 'Not Provided' && value !== 'Not Specified') {
      result[key] = value
    }
  }
  return result
}

function parseDMIBlocks(output: string): DMIRecord[] {
  return output
    .split(/^Handle /m)
    .slice(1)
    .map(block => parseDMIBlock(block))
}

export function parseSystemDMI(output: string): SystemIdentity {
  const b = parseDMIBlock(output)
  return {
    manufacturer: b['Manufacturer']  ?? 'Unknown',
    productName:  b['Product Name']  ?? 'Unknown',
    version:      b['Version']       ?? '',
    serialNumber: b['Serial Number'] ?? 'Unknown',
    uuid:         b['UUID']          ?? '',
    sku:          b['SKU Number'],
    family:       b['Family'],
  }
}

export function parseBIOSDMI(output: string): BIOSInfo {
  const b = parseDMIBlock(output)
  return {
    vendor:            b['Vendor']            ?? 'Unknown',
    version:           b['Version']           ?? 'Unknown',
    releaseDate:       b['Release Date']      ?? 'Unknown',
    revision:          b['BIOS Revision'],
    firmwareRevision:  b['Firmware Revision'],
  }
}

export function parseBaseBoardDMI(output: string): BaseBoardInfo {
  const b = parseDMIBlock(output)
  return {
    manufacturer: b['Manufacturer']  ?? 'Unknown',
    product:      b['Product Name']  ?? 'Unknown',
    version:      b['Version']       ?? '',
    serialNumber: b['Serial Number'] ?? 'Unknown',
  }
}

export function parseMemoryModules(output: string): MemoryModule[] {
  return parseDMIBlocks(output)
    .filter(b => b['Type'] && b['Type'] !== 'Unknown')
    .map(b => ({
      locator:         b['Locator']          ?? '',
      bankLocator:     b['Bank Locator']     ?? '',
      size:            parseMemSize(b['Size']),
      type:            b['Type']             ?? 'Unknown',
      speed:           parseInt(b['Speed']   ?? '0', 10),
      manufacturer:    b['Manufacturer']     ?? 'Unknown',
      serialNumber:    b['Serial Number']    ?? '',
      partNumber:      (b['Part Number'] ?? '').trim(),
      formFactor:      b['Form Factor']      ?? '',
      configuredSpeed: parseInt(b['Configured Memory Speed'] ?? b['Speed'] ?? '0', 10),
      empty:           b['Size'] === 'No Module Installed' || b['Size'] === '0 MB',
    }))
}

function parseMemSize(sizeStr: string | undefined): number {
  if (!sizeStr || sizeStr === 'No Module Installed') return 0
  const m = sizeStr.match(/(\d+)\s*(MB|GB)/)
  if (!m) return 0
  return m[2] === 'GB' ? parseInt(m[1], 10) * 1024 : parseInt(m[1], 10)
}
