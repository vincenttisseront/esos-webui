/**
 * GET /api/raid/hardware/diagnostic — Données brutes read-only pour diagnostic RAID matériel.
 * Retourne les sorties des commandes kernel (lspci, lsmod, dmesg, lsscsi, which).
 * Sécurité : commandes read-only uniquement. Pas de mutation.
 */
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { resolveScopedSanIdForRead } from '../../../utils/san-request-context'
import { collectRaidOverview } from '../../../utils/raid-overview.service'

// Cherche le premier CLI disponible et lit les champs de mode contrôleur via sortie texte (grep)
const CTRL_MODE_CMD = `_CLI=""
for _c in /opt/MegaRAID/perccli/perccli64 /opt/MegaRAID/perccli/perccli /opt/dell/perccli/perccli64 /usr/local/sbin/perccli64 /usr/sbin/perccli64 /sbin/perccli64 /opt/MegaRAID/storcli/storcli64 /usr/local/sbin/storcli64 /usr/sbin/storcli64 /sbin/storcli64; do
  [ -x "$_c" ] && { _CLI="$_c"; break; }
done
if [ -z "$_CLI" ]; then
  echo "(aucun CLI storcli/perccli détecté)"
else
  for _i in 0 1 2 3; do
    _raw=$("$_CLI" /c\${_i} show 2>/dev/null) || break
    echo "=== Contrôleur \${_i} ==="
    echo "$_raw" | grep -iE "Controller Mode|Current Personality|^Personality|Enable JBOD|JBOD Mode|RAID Level Supported|Product Name|Serial No|FW Version" | sed 's/^[[:space:]]*/  /'
    echo ""
  done
fi`

const DIAGNOSTIC_CMD = [
  'echo "===CTRL_MODE==="',
  CTRL_MODE_CMD,
  'echo "===LSPCI==="',
  "lspci -nn 2>/dev/null | grep -iE 'raid|storage|sas|scsi|perc|megaraid|lsi|broadcom|avago|dell' || lspci 2>/dev/null | grep -iE 'raid|storage|sas|scsi|perc|megaraid|lsi|broadcom|avago|dell' || echo '(lspci non disponible)'",
  'echo "===LSMOD==="',
  "lsmod 2>/dev/null | grep -iE 'megaraid|aacraid|mpt3sas|3w|hpsa|cciss|raid' || echo '(aucun module RAID détecté)'",
  'echo "===DMESG==="',
  "dmesg 2>/dev/null | grep -iE 'megaraid_sas|aacraid|MegaRAID|PERC|Avago SAS based MegaRAID driver|pci id.*0x1000|invader' | tail -120 || echo '(dmesg vide ou non disponible)'",
  'echo "===LSSCSI==="',
  "lsscsi -g 2>/dev/null || lsscsi 2>/dev/null || echo '(lsscsi non disponible)'",
  'echo "===WHICH_CLI==="',
  'which storcli storcli64 perccli perccli64 MegaCli MegaCli64 arcconf 2>/dev/null || echo "(aucun outil CLI RAID dans PATH)"',
  'echo "===DIRECT_PATHS==="',
  'for _p in /opt/MegaRAID/perccli/perccli64 /opt/MegaRAID/perccli/perccli /opt/MegaRAID/storcli/storcli64 /opt/MegaRAID/storcli/storcli /opt/dell/perccli/perccli64 /usr/sbin/perccli64 /usr/local/sbin/perccli64 /usr/sbin/storcli64 /usr/local/sbin/storcli64 /sbin/perccli64 /sbin/storcli64; do [ -x "$_p" ] && echo "FOUND: $_p"; done || true',
  'echo "===END_DIAGNOSTIC==="',
].join('\n')

// Max output size per section to prevent huge responses
const MAX_SECTION_CHARS = 8_000

function truncate(s: string): string {
  if (s.length <= MAX_SECTION_CHARS) return s.trim()
  return s.trim().slice(0, MAX_SECTION_CHARS) + `\n... [tronqué — ${s.length - MAX_SECTION_CHARS} caractères supprimés]`
}

function splitDiagSections(output: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const lines = output.split('\n')
  let current = ''
  const buf: string[] = []

  for (const line of lines) {
    const m = line.match(/^===([A-Z_]+)===/)
    if (m) {
      if (current) sections[current] = buf.join('\n')
      current = m[1]
      buf.length = 0
    } else {
      buf.push(line)
    }
  }
  if (current) sections[current] = buf.join('\n')
  return sections
}

function normalizeCliStatus(whichCliRaw: string, directPathsRaw: string): string {
  const whichTrimmed = (whichCliRaw ?? '').trim()
  const directFound = (directPathsRaw ?? '').split('\n').some(line => line.trim().startsWith('FOUND:'))
  if (!directFound) return whichTrimmed
  if (whichTrimmed.includes('(aucun outil CLI RAID dans PATH)')) {
    return [
      whichTrimmed,
      'CLI hors PATH mais disponible via chemin direct.',
    ].join('\n')
  }
  return whichTrimmed
}

export default defineEventHandler(async (event) => {
  const scopeId = resolveScopedSanIdForRead(event)

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }

    let stdout = ''
    try {
      const result = await manager.exec(DIAGNOSTIC_CMD, 30_000)
      stdout = result.stdout
    } catch (err: any) {
      throw createError({ statusCode: 500, statusMessage: err.message ?? 'Erreur diagnostic' })
    }

    const sections = splitDiagSections(stdout)
    let mappingApplied = ''
    try {
      const overview = await collectRaidOverview(manager)
      const lines: string[] = []
      for (const ctrl of overview.hardwareControllers) {
        for (const ld of ctrl.logicalDrives) {
          if (ld.osDeviceDetectionSource === 'lsscsi' && (ld.osDevicePath || ld.devicePath || ld.device)) {
            const path = ld.osDevicePath ?? ld.devicePath ?? ld.device
            lines.push(`Mapping lsscsi appliqué: ${ld.id} -> ${path}`)
          }
        }
      }
      mappingApplied = lines.join('\n')
    } catch {
      mappingApplied = ''
    }

    return {
      collectedAt: Date.now(),
      ctrlMode: truncate([sections.CTRL_MODE ?? '', mappingApplied].filter(Boolean).join('\n')),
      lspci: truncate(sections.LSPCI ?? ''),
      lsmod: truncate(sections.LSMOD ?? ''),
      dmesg: truncate(sections.DMESG ?? ''),
      lsscsi: truncate(sections.LSSCSI ?? ''),
      whichCli: truncate(normalizeCliStatus(sections.WHICH_CLI ?? '', sections.DIRECT_PATHS ?? '')),
      directPaths: truncate(sections.DIRECT_PATHS ?? ''),
    }
  }

  try {
    if (scopeId) return await withSanContext(scopeId, run)
    return await run()
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur diagnostic RAID',
    })
  }
})
