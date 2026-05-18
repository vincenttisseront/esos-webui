import { z } from 'zod'
import { readConfigFiles, NOT_FOUND } from '~~/server/utils/config-reader'
import { writeConfigFile, runCommand } from '~~/server/utils/config-writer'
import * as NetworkConfParser          from '~~/server/utils/parsers/network-conf.parser'
import { validateLinuxIfname, validateSearchDomain } from '~~/server/utils/remote-config-paths'

const NETWORK_CONF = '/etc/network.conf'
const SYNC_CONF    = '/usr/local/sbin/conf_sync.sh'

function isValidIP(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(o => parseInt(o, 10) <= 255)
}

const interfaceSchema = z.object({
  index:       z.number().int().min(0),
  ifname:      z.string().min(1),
  useDHCP:     z.boolean(),
  ipAddress:   z.string(),
  netmask:     z.string(),
  broadcast:   z.string(),
  mtu:         z.number().int().nullable().optional(),
  dhcpTimeout: z.number().int().min(1).max(300).optional(),
})

const bodySchema = z.object({
  gateway:      z.string(),
  nameservers:  z.array(z.string()),
  searchDomain: z.string(),
  interfaces:   z.array(interfaceSchema),
})

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const body  = await readBody(event)

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0].message })
  }

  const config = parsed.data

  const sdErr = validateSearchDomain(config.searchDomain)
  if (sdErr) throw createError({ statusCode: 400, message: sdErr })
  for (const iface of config.interfaces) {
    const ifErr = validateLinuxIfname(iface.ifname)
    if (ifErr) throw createError({ statusCode: 400, message: `${ifErr} (${iface.ifname})` })
  }

  // Validate static IPs
  if (config.gateway && !isValidIP(config.gateway)) {
    throw createError({ statusCode: 400, message: `Passerelle invalide : ${config.gateway}` })
  }
  for (const ns of config.nameservers.filter(Boolean)) {
    if (!isValidIP(ns)) {
      throw createError({ statusCode: 400, message: `Serveur DNS invalide : ${ns}` })
    }
  }
  for (const iface of config.interfaces) {
    if (!iface.useDHCP) {
      if (iface.ipAddress && !isValidIP(iface.ipAddress))
        throw createError({ statusCode: 400, message: `IP invalide pour ${iface.ifname}: ${iface.ipAddress}` })
      if (iface.netmask && !isValidIP(iface.netmask))
        throw createError({ statusCode: 400, message: `Masque invalide pour ${iface.ifname}: ${iface.netmask}` })
    }
  }

  // Read current /etc/network.conf to preserve unknown fields (bonding, ethtool opts, etc.)
  const files    = await readConfigFiles(sanId, [NETWORK_CONF])
  const existing = files.get(NETWORK_CONF)
  const original = existing && existing !== NOT_FOUND ? existing : ''

  const updated = NetworkConfParser.serializeNetworkConf(config, original)
  await writeConfigFile(sanId, NETWORK_CONF, updated)

  // Sync to USB flash drive so config survives reboot (same as TUI conf_sync.sh)
  try {
    await runCommand(sanId, `${SYNC_CONF} 2>&1 || true`, true, 30_000)
  } catch (err) {
    console.warn('[network save] conf_sync.sh failed (non-fatal):', (err as Error).message)
  }

  return { ok: true }
})

