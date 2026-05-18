import type { SystemConfigSnapshot, SystemConfigResponse, ConfigSectionResult, NetworkInterfaceConfig } from './types'
import type { SSHSessionManager } from './ssh-session-manager'
import { readConfigFiles, NOT_FOUND }   from './config-reader'
import { runCommand }                    from './config-writer'
import { getSSHPool }                    from './ssh-pool'
import * as NetworkConfParser            from './parsers/network-conf.parser'
import * as ResolvParser                 from './parsers/resolv.parser'
import * as NtpParser                    from './parsers/ntp.parser'
import * as SsmtpParser                  from './parsers/ssmtp.parser'

const NETWORK_CONF = '/etc/network.conf'
const RESOLV    = '/etc/resolv.conf'
const NTP_CONF  = '/etc/ntp.conf'
const NTP_SERVER = '/etc/ntp_server'  // TUI simple file: first NTP server only
const SSMTP     = '/etc/ssmtp/ssmtp.conf'

// ── Fault-tolerant section reader (SDD v3.6.1) ─────────────────────────────

function parseSection<T>(
  fn: () => T,
  bulkError: string | null,
): ConfigSectionResult<T> {
  if (bulkError) {
    return { data: null, status: 'error', error: { code: 'SSH_TIMEOUT', message: bulkError } }
  }
  try {
    return { data: fn(), status: 'ok' }
  } catch (err: any) {
    return {
      data:   null,
      status: 'error',
      error:  { code: err.code ?? 'PARSE_ERROR', message: err.message ?? 'Erreur de lecture' },
    }
  }
}

export async function readSystemConfigSections(
  sanId:   string,
  manager: SSHSessionManager,
): Promise<SystemConfigResponse> {
  // ── Lecture bulk des fichiers de config (une seule commande SSH) ─────────
  let files = new Map<string, string>()
  let bulkError: string | null = null

  try {
    files = await readConfigFiles(sanId, [NETWORK_CONF, RESOLV, NTP_CONF, NTP_SERVER, SSMTP])
  } catch (err: any) {
    bulkError = err.message ?? 'Lecture des fichiers échouée'
    console.error('[SystemConfig] Lecture bulk échouée:', bulkError)
  }

  // ── Données runtime (date, ntp, ip) en parallèle ────────────────────────
  const [runtimeResult, ipResult, ipLinkResult] = await Promise.allSettled([
    manager.exec(
      'date -u +"%Y-%m-%dT%H:%M:%SZ" && echo "---" && pgrep ntpd >/dev/null 2>&1 && echo running || echo stopped && echo "---" && readlink /etc/localtime 2>/dev/null || cat /etc/timezone 2>/dev/null || echo UTC && echo "---" && cat /etc/HOSTNAME 2>/dev/null || hostname 2>/dev/null || echo ""',
      15_000,
    ),
    manager.exec('ip -j addr 2>/dev/null || echo "[]"', 10_000),
    manager.exec('ip -j link 2>/dev/null || echo "[]"', 10_000),
  ])

  const runtimeLines = runtimeResult.status === 'fulfilled'
    ? runtimeResult.value.stdout.trim().split('\n')
    : []
  const currentTime    = runtimeLines[0] ?? ''
  const ntpRunning     = runtimeLines[2] === 'running'
  // Strip /usr/share/zoneinfo/ or /usr/share/zoneinfo/posix/ prefix
  const timezoneRaw    = (runtimeLines[4] ?? '').replace(/.*zoneinfo\/(?:posix\/)?/, '')
  const timezone       = timezoneRaw || 'UTC'
  // Hostname from runtime command (fallback when /etc/HOSTNAME is absent/empty)
  const hostnameRuntime = (runtimeLines[6] ?? '').trim()

  // ── Parser chaque section indépendamment ────────────────────────────────
  const hostnameSection = parseSection(() => {
    // Hostname is stored in /etc/network.conf [general] hostname/domainname
    // (rc.network reads these and calls /bin/hostname to apply them)
    const netRaw  = (files.get(NETWORK_CONF) ?? '').replace(NOT_FOUND, '').trim()
    let hostname  = ''
    let domainname = ''
    if (netRaw) {
      const parsed = NetworkConfParser.parseNetworkConf(netRaw)
      // hostname is not exposed by parseNetworkConf directly — read raw from general
      const generalMatch = netRaw.match(/^\[general\]([\s\S]*?)(?=\[|$)/m)
      if (generalMatch) {
        const hostnameMatch    = generalMatch[1].match(/^\s*hostname\s*=\s*(.+)$/m)
        const domainnameMatch  = generalMatch[1].match(/^\s*domainname\s*=\s*(.+)$/m)
        hostname   = hostnameMatch?.[1]?.trim()  ?? ''
        domainname = domainnameMatch?.[1]?.trim() ?? parsed.searchDomain ?? ''
      }
    }
    // Fallback: live hostname command
    if (!hostname) hostname = hostnameRuntime.split('.')[0]
    if (!hostname) throw Object.assign(new Error('Hostname introuvable dans network.conf'), { code: 'FILE_NOT_FOUND' })
    const fqdn = domainname ? `${hostname}.${domainname}` : hostname
    return { hostname, domain: domainname, fqdn }
  }, bulkError)

  const dateTimeSection = parseSection(() => {
    const ntpContent = files.get(NTP_CONF) ?? ''
    // Servers from ntp.conf (our format), fallback on /etc/ntp_server (TUI single-server file)
    let servers = ntpContent && ntpContent !== NOT_FOUND ? NtpParser.parseNtpConf(ntpContent) : []
    if (servers.length === 0) {
      const ntpServerRaw = (files.get(NTP_SERVER) ?? '').replace(NOT_FOUND, '').trim()
      if (ntpServerRaw) servers = [ntpServerRaw]
    }
    return {
      timezone,
      currentTime: currentTime || new Date().toISOString(),
      ntpEnabled:  servers.length > 0,
      ntpServers:  servers,
      ntpRunning,
    }
  }, bulkError)

  const networkSection = parseSection(() => {
    const netRaw = files.get(NETWORK_CONF) ?? ''
    if (!netRaw || netRaw === NOT_FOUND) {
      throw Object.assign(new Error('network.conf absent'), { code: 'FILE_NOT_FOUND' })
    }
    const cfg = NetworkConfParser.parseNetworkConf(netRaw)
    const resolvRaw = files.get(RESOLV)
    if (resolvRaw && resolvRaw !== NOT_FOUND) {
      const { nameservers, search } = ResolvParser.parseResolvConf(resolvRaw)
      cfg.nameservers  = nameservers
      cfg.searchDomain = search
    }
    // Enrichissement IP live
    if (ipResult.status === 'fulfilled') {
      try {
        const ipAddrs: Array<{ ifname: string; addr_info: Array<{ family: string; local: string }> }> =
          JSON.parse(ipResult.value.stdout || '[]')
        for (const iface of cfg.interfaces) {
          const live = ipAddrs.find(i => i.ifname === iface.ifname)
          if (live) {
            const v4 = live.addr_info.find(a => a.family === 'inet')
            iface.currentIp = v4?.local
          }
        }
      } catch { /* ignore */ }
    }
    if (ipLinkResult.status === 'fulfilled') {
      try {
        const ipLinks: Array<{ ifname: string; operstate: string }> =
          JSON.parse(ipLinkResult.value.stdout || '[]')
        for (const iface of cfg.interfaces as NetworkInterfaceConfig[]) {
          const live = ipLinks.find(l => l.ifname === iface.ifname)
          if (live) iface.state = live.operstate?.toLowerCase() === 'up' ? 'up' : 'down'
        }
      } catch { /* ignore */ }
    }
    return cfg
  }, bulkError)

  const smtpSection = parseSection(() => {
    const raw = files.get(SSMTP) ?? ''
    if (!raw || raw === NOT_FOUND) {
      throw Object.assign(new Error('ssmtp.conf absent'), { code: 'FILE_NOT_FOUND' })
    }
    return SsmtpParser.parseSsmtpConf(raw)
  }, bulkError)

  return {
    sanId,
    scannedAt: Date.now(),
    sshStatus: manager.getStatus(),
    hostname:  hostnameSection,
    dateTime:  dateTimeSection,
    network:   networkSection,
    smtp:      smtpSection,
  }
}

// ── Legacy wrapper (backward compat) ─────────────────────────────────────────

export async function readSystemConfig(sanId: string): Promise<SystemConfigSnapshot> {
  const files = await readConfigFiles(sanId, [NETWORK_CONF, RESOLV, NTP_CONF, NTP_SERVER, SSMTP])

  // ─── Hostname (stored in /etc/network.conf [general]) ──────────────────
  const netRawForHostname = (files.get(NETWORK_CONF) ?? '').replace(NOT_FOUND, '')
  let hostname = '', domain = ''
  const generalBlock = netRawForHostname.match(/^\[general\]([\s\S]*?)(?=\[|$)/m)
  if (generalBlock) {
    hostname = generalBlock[1].match(/^\s*hostname\s*=\s*(.+)$/m)?.[1]?.trim()  ?? ''
    domain   = generalBlock[1].match(/^\s*domainname\s*=\s*(.+)$/m)?.[1]?.trim() ?? ''
  }
  const fqdn = domain ? `${hostname}.${domain}` : hostname

  // ─── Date/Time ──────────────────────────────────────────────────────────
  const { stdout: tzRaw }   = await runCommand(sanId, 'readlink /etc/localtime 2>/dev/null || cat /etc/timezone 2>/dev/null || echo "UTC"')
  const { stdout: dateRaw } = await runCommand(sanId, 'date -u +"%Y-%m-%dT%H:%M:%SZ"')
  const { stdout: pgrepOut} = await runCommand(sanId, 'pgrep ntpd >/dev/null 2>&1 && echo running || echo stopped')

  const timezoneRaw = tzRaw.trim()
  const timezone    = timezoneRaw.replace(/.*zoneinfo\/(?:posix\/)?/, '')

  const ntpContent   = files.get(NTP_CONF)
  let ntpServers     = ntpContent && ntpContent !== NOT_FOUND ? NtpParser.parseNtpConf(ntpContent) : []
  if (ntpServers.length === 0) {
    const ntpServerRaw = (files.get(NTP_SERVER) ?? '').replace(NOT_FOUND, '').trim()
    if (ntpServerRaw) ntpServers = [ntpServerRaw]
  }
  const ntpRunning   = pgrepOut.trim() === 'running'

  // ─── Network ────────────────────────────────────────────────────────────
  const netConfContent = files.get(NETWORK_CONF) ?? ''
  const netConfig      = netConfContent !== NOT_FOUND
    ? NetworkConfParser.parseNetworkConf(netConfContent)
    : { gateway: '', nameservers: [], searchDomain: '', interfaces: [] }

  // Nameservers and search domain from resolv.conf take precedence (live state)
  const resolvContent = files.get(RESOLV)
  if (resolvContent && resolvContent !== NOT_FOUND) {
    const { nameservers, search } = ResolvParser.parseResolvConf(resolvContent)
    netConfig.nameservers  = nameservers
    netConfig.searchDomain = search
  }

  // Enrich with live IP addresses
  const { stdout: ipJson } = await runCommand(sanId, 'ip -j addr 2>/dev/null || echo "[]"')
  try {
    const ipAddrs: Array<{ ifname: string; addr_info: Array<{ family: string; local: string }> }> =
      JSON.parse(ipJson || '[]')
    for (const iface of netConfig.interfaces) {
      const liveIface = ipAddrs.find(i => i.ifname === iface.ifname)
      if (liveIface) {
        const v4 = liveIface.addr_info.find(a => a.family === 'inet')
        iface.currentIp = v4?.local
      }
    }
  } catch { /* ignore parse errors */ }

  // Enrich with interface state
  const { stdout: ipLinkJson } = await runCommand(sanId, 'ip -j link 2>/dev/null || echo "[]"')
  try {
    const ipLinks: Array<{ ifname: string; operstate: string }> = JSON.parse(ipLinkJson || '[]')
    for (const iface of netConfig.interfaces as NetworkInterfaceConfig[]) {
      const liveLink = ipLinks.find(l => l.ifname === iface.ifname)
      if (liveLink) {
        iface.state = liveLink.operstate?.toLowerCase() === 'up' ? 'up' : 'down'
      }
    }
  } catch { /* ignore */ }

  // ─── SMTP ───────────────────────────────────────────────────────────────
  const ssmtpContent = files.get(SSMTP)
  const smtp = ssmtpContent && ssmtpContent !== NOT_FOUND
    ? SsmtpParser.parseSsmtpConf(ssmtpContent)
    : { alertEmail: '', mailHub: '', authUser: '', useTLS: false, useSTARTTLS: false, authMethod: '' as const, fromOverride: false }

  return {
    sanId,
    scannedAt: Date.now(),
    hostname: { hostname, domain, fqdn },
    dateTime: {
      timezone,
      currentTime: dateRaw.trim(),
      ntpEnabled:  ntpServers.length > 0,
      ntpServers,
      ntpRunning,
    },
    network: netConfig,
    smtp,
  }
}
