/**
 * Batch 2C — allowlisted remote paths for system-config read/write via SSH,
 * plus shared input validation to avoid shell / config poisoning.
 */

/** Paths used by `readConfigFiles` / `writeConfigFile` from system-config flows only. */
export const ALLOWED_REMOTE_CONFIG_PATHS = Object.freeze([
  '/etc/network.conf',
  '/etc/resolv.conf',
  '/etc/ntp.conf',
  '/etc/ntp_server',
  '/etc/ssmtp/ssmtp.conf',
] as const)

const ALLOWED_SET = new Set<string>(ALLOWED_REMOTE_CONFIG_PATHS)

export function assertAllowedRemoteConfigPath(path: string): void {
  if (!ALLOWED_SET.has(path)) {
    throw new Error(`Remote config path not allowed: ${path}`)
  }
}

// ── POSIX single-quoted string for remote shell (safe interpolation) ───────

/** Wrap `s` in single quotes for `sh -c` / bash, escaping embedded `'`. */
export function shellSingleQuoteForRemote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

// ── SMTP / recipient (smtp.patch + smtp/test) ───────────────────────────────

const CTRL_OR_WS = /[\x00-\x20\x7F]/

/** Single addr-spec subset: safe for `root=` line and `ssmtp` argv (no shell metachars). */
export function validateSafeSmtpEmail(value: string): string | null {
  const v = value.trim()
  if (!v) return 'Adresse email vide'
  if (v.length > 254) return 'Adresse email trop longue'
  if (CTRL_OR_WS.test(v)) return 'Adresse email invalide (caractères interdits)'
  // Local@domain — conservative charset (no quotes, parens, semicolons, etc.)
  if (!/^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(v)) return 'Adresse email invalide'
  return null
}

/** mailhub= host or [IPv6]:port / host:port — line value must not inject newlines into ssmtp.conf */
export function validateSafeSmtpMailHub(value: string): string | null {
  const v = value.trim()
  if (!v) return 'Serveur SMTP (mailhub) requis'
  if (v.length > 255) return 'mailhub trop long'
  if (CTRL_OR_WS.test(v)) return 'mailhub invalide (caractères interdits)'
  // IPv6 bracket form, IPv4, hostname, optional :port
  if (!/^(\[[0-9a-fA-F:.]+\]|(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z][a-zA-Z0-9.-]*)(:[0-9]{1,5})?$/.test(v)) return 'mailhub invalide'
  return null
}

export function validateSafeSmtpAuthUser(value: string): string | null {
  if (!value) return null
  if (value.length > 128) return 'AuthUser trop long'
  if (CTRL_OR_WS.test(value)) return 'AuthUser invalide (caractères interdits)'
  if (!/^[a-zA-Z0-9._@+%-]+$/.test(value)) return 'AuthUser invalide'
  return null
}

/** Reject newline / NUL in stored secret (would break ssmtp.conf lines). */
export function validateSmtpAuthPass(value: string): string | null {
  if (!value) return null
  if (value.length > 512) return 'Mot de passe SMTP trop long'
  if (/[\r\n\x00]/.test(value)) return 'Mot de passe SMTP invalide'
  return null
}

// ── NTP server hostnames / IPs (datetime.patch) ──────────────────────────────

function isValidIPv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(o => parseInt(o, 10) <= 255)
}

export function validateNtpServerHost(value: string): string | null {
  const v = value.trim()
  if (!v) return 'Serveur NTP vide'
  if (v.length > 253) return 'Serveur NTP trop long'
  if (CTRL_OR_WS.test(v)) return 'Serveur NTP invalide (caractères interdits)'
  if (isValidIPv4(v)) return null
  if (/^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(v)) return null
  return 'Serveur NTP invalide (hostname ou IPv4 attendu)'
}

// ── Network (network.patch) ──────────────────────────────────────────────────

/** Linux netdevice name (IFNAMSIZ 16 → max 15 chars), incl. vlan subif `eth0.10`. */
export function validateLinuxIfname(value: string): string | null {
  if (!value || value.length > 15) return 'Nom d’interface invalide'
  if (!/^[a-zA-Z0-9._:-]+$/.test(value)) return 'Nom d’interface invalide'
  return null
}

/** resolv.conf "search" / network.conf search domain — empty or DNS-like labels. */
export function validateSearchDomain(value: string): string | null {
  if (value === '') return null
  if (value.length > 255) return 'Domaine de recherche trop long'
  if (CTRL_OR_WS.test(value)) return 'Domaine de recherche invalide'
  if (!/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.?$/.test(value)) {
    return 'Domaine de recherche invalide'
  }
  return null
}
