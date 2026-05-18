/**
 * Parser / serializer for /etc/network.conf (ESOS INI format).
 *
 * The file is used by /etc/rc.d/rc.network to configure interfaces.
 * Format example:
 *
 *   [general]
 *   hostname = myhost
 *   domainname = example.com
 *   defaultgw = 192.168.1.1
 *   nameserver1 = 8.8.8.8
 *   nameserver2 = 8.8.4.4
 *   nameserver3 =
 *
 *   [eth0]
 *   bootproto = static
 *   ipaddr = 192.168.1.100
 *   netmask = 255.255.255.0
 *   broadcast = 255.255.255.255
 *   mtu = 1500
 *
 *   [eth1]
 *   bootproto = dhcp
 *   mtu = 1500
 */

import type { NetworkGeneralConfig, NetworkInterfaceConfig } from '../types'

type SectionMap = Map<string, string>
type IniMap     = Map<string, SectionMap>

function parseIni(content: string): IniMap {
  const sections: IniMap      = new Map()
  let current:   SectionMap | null = null

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue

    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      current = new Map()
      sections.set(sectionMatch[1].trim(), current)
      continue
    }

    const kvMatch = line.match(/^([^=]+?)\s*=\s*(.*)$/)
    if (kvMatch && current) {
      current.set(kvMatch[1].trim(), kvMatch[2].trim())
    }
  }

  return sections
}

export function parseNetworkConf(content: string): NetworkGeneralConfig {
  const ini     = parseIni(content)
  const general = ini.get('general') ?? new Map<string, string>()

  const nameservers: string[] = []
  for (const key of ['nameserver1', 'nameserver2', 'nameserver3']) {
    const ns = general.get(key) ?? ''
    if (ns) nameservers.push(ns)
  }

  const interfaces: NetworkInterfaceConfig[] = []
  let index = 0
  for (const [section, fields] of ini) {
    if (section === 'general') continue
    const bootproto = (fields.get('bootproto') ?? 'static').toLowerCase()
    const useDHCP   = bootproto === 'dhcp'
    const mtuRaw    = fields.get('mtu')
    interfaces.push({
      index:       index++,
      ifname:      section,
      useDHCP,
      ipAddress:   fields.get('ipaddr')    ?? '',
      netmask:     fields.get('netmask')   ?? '',
      broadcast:   fields.get('broadcast') ?? '',
      mtu:         mtuRaw ? parseInt(mtuRaw, 10) : 1500,
      dhcpTimeout: 15, // not used by rc.network, kept for type compat
    })
  }

  return {
    gateway:      general.get('defaultgw')  ?? '',
    nameservers,
    searchDomain: general.get('domainname') ?? '',
    interfaces,
  }
}

export function serializeNetworkConf(
  config:          NetworkGeneralConfig,
  originalContent: string,
  hostname?:       string,
  domainname?:     string,
): string {
  const original = parseIni(originalContent)

  // ── [general] section ────────────────────────────────────────────────────
  const general = new Map(original.get('general') ?? new Map<string, string>())

  // Preserve existing hostname/domainname unless explicitly provided
  if (hostname)   general.set('hostname',   hostname)
  if (domainname) general.set('domainname', domainname)
  else if (config.searchDomain) general.set('domainname', config.searchDomain)

  // Gateway
  if (config.gateway) general.set('defaultgw', config.gateway)
  else                general.delete('defaultgw')

  // Nameservers (always write 3 slots for clean diff)
  const ns = config.nameservers.filter(Boolean)
  general.set('nameserver1', ns[0] ?? '')
  general.set('nameserver2', ns[1] ?? '')
  general.set('nameserver3', ns[2] ?? '')

  // ── Build output ─────────────────────────────────────────────────────────
  let out = '; ESOS network configuration\n; Managed by ESOS WebUI\n\n'
  out += '[general]\n'
  for (const [k, v] of general) {
    out += `${k} = ${v}\n`
  }

  // ── Interface sections ───────────────────────────────────────────────────
  for (const iface of config.interfaces) {
    // Preserve any unknown fields (bonding, ethtool opts, etc.)
    const origSection = new Map(original.get(iface.ifname) ?? new Map<string, string>())

    origSection.set('bootproto', iface.useDHCP ? 'dhcp' : 'static')
    origSection.set('mtu', String(iface.mtu ?? 1500))

    if (iface.useDHCP) {
      origSection.delete('ipaddr')
      origSection.delete('netmask')
      origSection.delete('broadcast')
    } else {
      origSection.set('ipaddr',    iface.ipAddress)
      origSection.set('netmask',   iface.netmask)
      origSection.set('broadcast', iface.broadcast)
    }

    out += `\n[${iface.ifname}]\n`
    for (const [k, v] of origSection) {
      out += `${k} = ${v}\n`
    }
  }

  return out
}
