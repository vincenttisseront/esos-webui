import type { NetworkGeneralConfig, NetworkInterfaceConfig } from '../types'

export function parseRcInet1(content: string): NetworkGeneralConfig {
  const lines  = content.split('\n')
  const values = new Map<string, string>()

  for (const line of lines) {
    const m = line.match(/^([A-Z_]+(?:\[\d+\])?)\s*=\s*"?([^"#\n]*)"?\s*$/)
    if (m) values.set(m[1].trim(), m[2].trim())
  }

  const ifaceIndexes = new Set<number>()
  for (const key of values.keys()) {
    const m = key.match(/\[(\d+)\]$/)
    if (m) ifaceIndexes.add(parseInt(m[1], 10))
  }

  const interfaces: NetworkInterfaceConfig[] = [...ifaceIndexes].sort((a, b) => a - b).map(i => ({
    index:       i,
    ifname:      values.get(`IFNAME[${i}]`)         ?? '',
    useDHCP:     (values.get(`USE_DHCP[${i}]`)      ?? 'no').toLowerCase() === 'yes',
    ipAddress:   values.get(`IPADDR[${i}]`)          ?? '',
    netmask:     values.get(`NETMASK[${i}]`)         ?? '',
    broadcast:   values.get(`BROADCAST[${i}]`)       ?? '',
    mtu:         values.get(`MTU[${i}]`)             ? parseInt(values.get(`MTU[${i}]`)!, 10) : null,
    dhcpTimeout: parseInt(values.get(`DHCP_TIMEOUT[${i}]`) ?? '15', 10),
  }))

  return {
    gateway:      values.get('GATEWAY') ?? '',
    nameservers:  [],
    searchDomain: '',
    interfaces,
  }
}

export function serializeRcInet1(config: NetworkGeneralConfig, originalContent: string): string {
  let output = originalContent

  const setField = (key: string, value: string) => {
    const pattern     = new RegExp(`^(${escapeRegex(key)}\\s*=\\s*)("?)[^"#\\n]*("?)`, 'm')
    const replacement = `$1"${value}"`
    if (pattern.test(output)) {
      output = output.replace(pattern, replacement)
    } else {
      output += `\n${key}="${value}"`
    }
  }

  setField('GATEWAY', config.gateway)

  for (const iface of config.interfaces) {
    const i = iface.index
    setField(`IFNAME[${i}]`,       iface.ifname)
    setField(`USE_DHCP[${i}]`,     iface.useDHCP ? 'yes' : 'no')
    setField(`DHCP_TIMEOUT[${i}]`, String(iface.dhcpTimeout))
    setField(`IPADDR[${i}]`,       iface.useDHCP ? '' : iface.ipAddress)
    setField(`NETMASK[${i}]`,      iface.useDHCP ? '' : iface.netmask)
    setField(`BROADCAST[${i}]`,    iface.useDHCP ? '' : iface.broadcast)
    setField(`MTU[${i}]`,          iface.mtu ? String(iface.mtu) : '')
  }

  return output
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
