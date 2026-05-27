import type { SSHSessionManager } from './ssh-session-manager'
import type { MissingToolsReadinessResponse } from '~/types/missing-tools'
import { collectKernelRaidInfo } from './raid-pci-detection'

const RAID_CLI_PATHS = [
  '/opt/MegaRAID/perccli/perccli64',
  '/opt/MegaRAID/perccli/perccli',
  '/opt/dell/perccli/perccli64',
  '/usr/local/sbin/perccli64',
  '/usr/sbin/perccli64',
  '/sbin/perccli64',
  '/opt/MegaRAID/storcli/storcli64',
  '/opt/MegaRAID/storcli/storcli',
  '/usr/local/sbin/storcli64',
  '/usr/sbin/storcli64',
  '/sbin/storcli64',
] as const

type ToolName = 'perccli' | 'perccli64' | 'storcli' | 'storcli64'

export function parseWhichAndPaths(out: string): Record<ToolName, boolean> & { resolvedPath: string | null } {
  const lines = out.split('\n').map(l => l.trim()).filter(Boolean)
  const has = {
    perccli: false,
    perccli64: false,
    storcli: false,
    storcli64: false,
    resolvedPath: null as string | null,
  }

  for (const l of lines) {
    if (l.includes('perccli64')) has.perccli64 = true
    else if (l.includes('perccli')) has.perccli = true
    if (l.includes('storcli64')) has.storcli64 = true
    else if (l.includes('storcli')) has.storcli = true
  }

  // Prefer the first usable absolute path; then short name fallback.
  for (const l of lines) {
    if (l.startsWith('/') && (l.includes('perccli64') || l.includes('storcli64') || l.endsWith('/perccli') || l.endsWith('/storcli'))) {
      has.resolvedPath = l
      return has
    }
  }
  if (has.perccli64) has.resolvedPath = 'perccli64'
  else if (has.storcli64) has.resolvedPath = 'storcli64'
  else if (has.perccli) has.resolvedPath = 'perccli'
  else if (has.storcli) has.resolvedPath = 'storcli'

  return has
}

export function inferControllerVendorFromPciEvidence(
  pciRaw: string,
): 'dell_perc' | 'lsi_megaraid' | 'adaptec_aacraid' | 'unknown' | null {
  const lower = pciRaw.toLowerCase()
  if (!lower.trim()) return null
  if (lower.includes('adaptec') || lower.includes('aacraid') || lower.includes('microsemi') || lower.includes('pmc-sierra')) {
    return 'adaptec_aacraid'
  }
  if (lower.includes('perc') || lower.includes('dell')) return 'dell_perc'
  if (lower.includes('megaraid') || lower.includes('lsi') || lower.includes('avago') || lower.includes('broadcom')) return 'lsi_megaraid'
  return 'unknown'
}

async function readCliVersion(manager: SSHSessionManager, cliPath: string | null): Promise<string | null> {
  if (!cliPath) return null
  try {
    const { stdout } = await manager.exec(`${cliPath} -v 2>/dev/null | head -3 || true`, 10_000)
    const v = stdout.trim()
    return v || null
  } catch {
    return null
  }
}

export async function readMissingToolsReadiness(manager: SSHSessionManager, sanId: string): Promise<MissingToolsReadinessResponse> {
  if (!manager.isReady()) {
    return { status: 'unavailable', error: { code: 'SSH_DOWN', message: 'SSH non connecté' } }
  }

  try {
    // Minimal probe (don’t run full raid overview).
    const [kernel, cliScan] = await Promise.all([
      collectKernelRaidInfo(manager),
      manager.exec([
        'which perccli perccli64 storcli storcli64 arcconf MegaCli64 megacli 2>/dev/null || true',
        `for _p in ${RAID_CLI_PATHS.map(p => `"${p}"`).join(' ')}; do [ -x "$_p" ] && echo "$_p"; done 2>/dev/null || true`,
      ].join('\n'), 15_000),
    ])

    const vendor = inferControllerVendorFromPciEvidence((kernel.pciCandidates?.[0]?.rawLine ?? '') + '\n' + (kernel.dmesgRaw ?? ''))
    const detected = (kernel.pciCandidates?.length ?? 0) > 0 || (kernel.kernelLogicalDrives?.length ?? 0) > 0

    const parsed = parseWhichAndPaths(cliScan.stdout ?? '')
    const resolvedPath = parsed.resolvedPath
    const version = await readCliVersion(manager, resolvedPath)

    const arcconf = cliScan.stdout?.includes('arcconf') ?? false
    const megacli64 = cliScan.stdout?.includes('MegaCli64') || cliScan.stdout?.includes('megacli') || false
    const cliPresent = parsed.perccli64 || parsed.storcli64 || parsed.perccli || parsed.storcli

    const recommendation = (!cliPresent && detected && (vendor === 'dell_perc' || vendor === 'lsi_megaraid'))
      ? { action: 'install_perccli64' as const, reason: 'Contrôleur PERC/MegaRAID détecté mais perccli/storcli absent', packageKind: 'perccli_rpm' as const }
      : { action: 'none' as const, reason: cliPresent ? 'Outil CLI déjà présent' : (detected ? 'Aucune action recommandée' : 'Aucun contrôleur RAID matériel détecté'), packageKind: null }

    return {
      status: 'ok',
      data: {
        sanId,
        scannedAt: Date.now(),
        controller: {
          detected,
          vendor,
          model: kernel.pciCandidates?.[0]?.model ?? null,
          pciAddress: kernel.pciCandidates?.[0]?.pciAddress ?? null,
          managementMode: detected ? (cliPresent ? 'full' : 'read_only_limited') : null,
        },
        tools: {
          perccli: parsed.perccli,
          perccli64: parsed.perccli64,
          storcli: parsed.storcli,
          storcli64: parsed.storcli64,
          arcconf,
          megacli64,
          resolvedPath,
          version,
        },
        recommendation,
      },
    }
  } catch (err: any) {
    return { status: 'unavailable', error: { code: 'SSH_ERROR', message: err?.message ?? 'Erreur readiness' } }
  }
}

