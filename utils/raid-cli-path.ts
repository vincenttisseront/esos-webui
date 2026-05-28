/**
 * RAID CLI (perccli/storcli) path detection and normalization.
 * Shared between server discovery and client-side eligibility display.
 */

export const KNOWN_RAID_CLI_PATHS = [
  '/opt/MegaRAID/perccli/perccli64',
  '/opt/MegaRAID/perccli/perccli',
  '/opt/MegaRAID/storcli/storcli64',
  '/opt/MegaRAID/storcli/storcli',
  '/opt/dell/perccli/perccli64',
  '/usr/local/sbin/perccli64',
  '/usr/sbin/perccli64',
  '/sbin/perccli64',
  '/usr/local/sbin/storcli64',
  '/usr/sbin/storcli64',
  '/sbin/storcli64',
  '/Opt/MegaRAID/Perccli/Perccli64',
  '/Opt/MegaRAID/Perccli/Perccli',
  '/Opt/MegaRAID/Storcli/Storcli64',
] as const

export function raidCliBasename(path: string): string {
  const segment = path.replace(/\\/g, '/').split('/').pop() ?? path
  return segment.toLowerCase()
}

export function normalizeRaidCliPath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  return normalized
}

export function isRaidCliPath(path: string): boolean {
  const base = raidCliBasename(path)
  return base === 'perccli64' || base === 'perccli' || base === 'storcli64' || base === 'storcli'
}

export function inferRaidCliTool(path: string): 'perccli' | 'storcli' {
  const lower = path.toLowerCase()
  return lower.includes('perccli') ? 'perccli' : 'storcli'
}

/** Case-insensitive scan of tools overview / which output. */
export function extractRaidCliFromToolsOutput(output: string): string | null {
  for (const line of output.split('\n')) {
    const l = line.trim()
    if (l.startsWith('/') && isRaidCliPath(l)) return normalizeRaidCliPath(l)
  }
  for (const line of output.split('\n')) {
    const l = line.trim()
    if (isRaidCliPath(l)) return normalizeRaidCliPath(l)
  }
  return null
}

export function toolsOutputHasRaidCli(output: string): { perccli: boolean; storcli: boolean } {
  const lower = output.toLowerCase()
  return {
    perccli: lower.includes('perccli'),
    storcli: lower.includes('storcli'),
  }
}

/** Strip leading noise before JSON object in storcli/perccli output. */
export function extractStorCliJsonPayload(stdout: string): string {
  const start = stdout.indexOf('{')
  if (start < 0) return stdout.trim()
  return stdout.slice(start).trim()
}

export function storCliJsonHasControllers(payload: string): boolean {
  try {
    const data = JSON.parse(payload) as { Controllers?: unknown[]; controllers?: unknown[] }
    const list = data.Controllers ?? data.controllers
    return Array.isArray(list) && list.length > 0
  } catch {
    return false
  }
}

/** Shell snippet: resolve first executable perccli64/storcli64 on remote host. */
export function buildResolveRaidCliShell(hint?: string | null): string {
  const qHint = hint ? `'${hint.replace(/'/g, `'\\''`)}'` : '""'
  const paths = KNOWN_RAID_CLI_PATHS.map(p => `"${p}"`).join(' ')
  return [
    'export PATH="/usr/local/sbin:/usr/sbin:/sbin:$PATH"',
    `_H=${qHint}`,
    'if [ -n "$_H" ] && [ -x "$_H" ]; then echo "$_H"; exit 0; fi',
    `for _p in ${paths}; do`,
    '  if [ -x "$_p" ]; then echo "$_p"; exit 0; fi',
    'done',
    '_F=$(find /opt /Opt /usr/local/sbin /usr/sbin /sbin 2>/dev/null \\',
    '  \\( -iname perccli64 -o -iname storcli64 -o -iname perccli -o -iname storcli \\) \\',
    '  -type f -perm -111 2>/dev/null | head -1)',
    'if [ -n "$_F" ]; then echo "$_F"; fi',
  ].join('\n')
}

/** Read-only validation command (matches missing-tools temp install checks). */
export function buildValidateRaidCliShell(cliPath: string): string {
  const q = cliPath.replace(/'/g, `'\\''`)
  return [
    'export PATH="/usr/local/sbin:/usr/sbin:/sbin:$PATH"',
    `${q} /call show J 2>/dev/null`,
  ].join('\n')
}
