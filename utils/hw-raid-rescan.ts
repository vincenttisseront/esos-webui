export function resolveRescanHost(input: {
  requestedHost?: string
  scsiAddress?: string
}): string | null {
  const requested = input.requestedHost?.trim()
  if (requested && /^\d+$/.test(requested)) return requested
  const fromScsi = input.scsiAddress?.match(/^(\d+):/)?.[1]
  return fromScsi ?? null
}

export interface RescanStep {
  key: 'targeted_hosts' | 'all_hosts' | 'scsi_device_rescan' | 'udev_settle'
  command: string
  scannedHosts: string[]
}

export function parseScsiHostProcNames(raw: string): Array<{ host: string; procName: string }> {
  const out: Array<{ host: string; procName: string }> = []
  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^host(\d+)\s+(.+)$/)
    if (!m) continue
    out.push({ host: m[1]!, procName: m[2]!.trim() })
  }
  return out
}

export function megaraidHostsFromProcNames(raw: string): string[] {
  return parseScsiHostProcNames(raw)
    .filter(x => x.procName.toLowerCase() === 'megaraid_sas')
    .map(x => x.host)
}

export function buildRescanPlan(input: { preferredHost: string | null; megaraidHosts: string[] }): RescanStep[] {
  const hosts = input.megaraidHosts.length
    ? [...new Set(input.megaraidHosts)]
    : (input.preferredHost ? [input.preferredHost] : [])
  const targeted = hosts.length
    ? `for _h in ${hosts.map(h => `"${h}"`).join(' ')}; do [ -w "/sys/class/scsi_host/host$_h/scan" ] && echo "- - -" > "/sys/class/scsi_host/host$_h/scan"; done 2>/dev/null || true`
    : 'true'
  return [
    {
      key: 'targeted_hosts',
      command: targeted,
      scannedHosts: hosts,
    },
    {
      key: 'all_hosts',
      command: 'for _h in /sys/class/scsi_host/host*/scan; do [ -w "$_h" ] && echo "- - -" > "$_h"; done 2>/dev/null || true',
      scannedHosts: [],
    },
    {
      key: 'scsi_device_rescan',
      command: 'for _d in /sys/class/scsi_device/*/device/rescan; do [ -w "$_d" ] && echo 1 > "$_d"; done 2>/dev/null || true',
      scannedHosts: [],
    },
    {
      key: 'udev_settle',
      command: 'command -v udevadm >/dev/null 2>&1 && udevadm settle || true',
      scannedHosts: [],
    },
  ]
}

export function diffLines(before: string, after: string): string[] {
  const b = new Set(before.split('\n').map(l => l.trim()).filter(Boolean))
  const out: string[] = []
  for (const l of after.split('\n').map(x => x.trim()).filter(Boolean)) {
    if (!b.has(l)) out.push(l)
  }
  return out
}

export function buildRescanOutcome(mappedPath: string | null): {
  foundNewDevice: boolean
  suggestReboot: boolean
  resultMessage: string
} {
  if (mappedPath) {
    return {
      foundNewDevice: true,
      suggestReboot: false,
      resultMessage: `Nouveau périphérique détecté: ${mappedPath}`,
    }
  }
  return {
    foundNewDevice: false,
    suggestReboot: true,
    resultMessage: 'Toujours non détecté. Un redémarrage peut être nécessaire.',
  }
}
