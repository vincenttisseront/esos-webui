import { shellSingleQuoteForRemote } from './remote-config-paths'
import type { SSHSessionManager } from './ssh-session-manager'

export type EsosRootPartition = {
  path: string
  label: string
  sizeBytes: number | null
}

export type MissingToolsPreflightResult = {
  ok: boolean
  blockers: string[]
  warnings: string[]
  detected: {
    esosRootPartitions: EsosRootPartition[]
    selectedRootPartition: string | null
    hasDuplicateEsosRootLabel: boolean
    primaryImagePath: string | null
    imageKind: 'sqsh' | 'cpio_bz2' | 'unknown' | null
    tmpFreeBytes: number | null
    requiredCommands: Record<string, boolean>
  }
}

export const REQUIRED_CMDS = [
  'rpm2cpio',
  'cpio',
  'unsquashfs',
  'mksquashfs',
  'mount',
  'umount',
  'sync',
  'df',
  'lsblk',
] as const

const ESOS_ROOT_LABELS = new Set(['esos_root', 'ESOS_ROOT'])

export function parseLsblkLabelOutput(raw: string): EsosRootPartition[] {
  // Expected lines: /dev/sda2|esos_root|123456789
  const out: EsosRootPartition[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const [path, label, size] = t.split('|')
    if (!path || !label) continue
    const sz = size ? Number.parseInt(size, 10) : NaN
    out.push({
      path: path.trim(),
      label: label.trim(),
      sizeBytes: Number.isFinite(sz) ? sz : null,
    })
  }
  return out
}

export function parseDfAvailBytes(dfOutput: string): number | null {
  const lines = dfOutput.trim().split('\n').filter(Boolean)
  for (const line of lines) {
    if (line.startsWith('Filesystem')) continue
    const cols = line.split(/\s+/)
    if (cols.length >= 4) {
      const avail = Number.parseInt(cols[3], 10)
      if (!Number.isNaN(avail)) return avail
    }
  }
  return null
}

export function validateSelectedRootPartition(
  selected: string | undefined,
  partitions: EsosRootPartition[],
): string | null {
  if (!selected) return null
  const s = selected.trim()
  if (!s) return null
  return partitions.some(p => p.path === s) ? s : null
}

export async function runMissingToolsPreflight(input: {
  manager: SSHSessionManager
  selectedRootPartition?: string
}): Promise<MissingToolsPreflightResult> {
  const blockers: string[] = []
  const warnings: string[] = []

  const cmdPresence = await input.manager.exec(
    REQUIRED_CMDS.map(c => `command -v ${c} >/dev/null 2>&1 && echo "${c}=yes" || echo "${c}=no"`).join('\n'),
    15_000,
  )
  const requiredCommands: Record<string, boolean> = {}
  for (const line of cmdPresence.stdout.split('\n')) {
    const m = line.trim().match(/^([a-zA-Z0-9_+-]+)=(yes|no)$/)
    if (m) requiredCommands[m[1]] = m[2] === 'yes'
  }
  for (const c of REQUIRED_CMDS) {
    if (!requiredCommands[c]) blockers.push(`Binaire requis manquant: ${c}`)
  }

  const dfTmp = await input.manager.exec('df -B1 /tmp 2>/dev/null || echo ""', 10_000)
  const tmpFreeBytes = parseDfAvailBytes(dfTmp.stdout)
  if (tmpFreeBytes !== null && tmpFreeBytes < 512 * 1024 * 1024) {
    blockers.push('Espace libre insuffisant dans /tmp (min 512 MiB)')
  } else if (tmpFreeBytes !== null && tmpFreeBytes < 1024 * 1024 * 1024) {
    warnings.push('Espace libre /tmp faible (< 1 GiB) — l’injection squashfs peut échouer')
  }

  const lsblk = await input.manager.exec(
    // PATH|LABEL|SIZE (bytes)
    "lsblk -nr -o PATH,LABEL,SIZE -b 2>/dev/null | awk 'NF>=2{print $1\"|\"$2\"|\"$3}' || echo \"\"",
    15_000,
  )
  const allParts = parseLsblkLabelOutput(lsblk.stdout)
    .filter(p => ESOS_ROOT_LABELS.has(p.label))

  const hasDuplicate = allParts.length > 1
  if (allParts.length === 0) blockers.push('Partition esos_root introuvable (LABEL=esos_root)')
  if (hasDuplicate && !input.selectedRootPartition) {
    blockers.push('Plusieurs partitions esos_root détectées — sélection explicite requise')
  }

  const selectedRootPartition = validateSelectedRootPartition(input.selectedRootPartition, allParts)
  if (input.selectedRootPartition && !selectedRootPartition) {
    blockers.push('Partition cible invalide (doit être une partition esos_root détectée)')
  }

  // Detect PRIMARY image kind when a target is selected (non-destructive: mount ro)
  let primaryImagePath: string | null = null
  let imageKind: MissingToolsPreflightResult['detected']['imageKind'] = null

  if (selectedRootPartition) {
    const mnt = '/mnt/esos-root-preflight'
    const qMnt = shellSingleQuoteForRemote(mnt)
    const qPart = shellSingleQuoteForRemote(selectedRootPartition)
    const probe = await input.manager.exec([
      `mkdir -p ${qMnt}`,
      `mount -o ro ${qPart} ${qMnt} 2>/dev/null || (echo MOUNT_FAIL; exit 2)`,
      `if [ -f ${qMnt}/PRIMARY-root.sqsh ]; then echo "IMG=${mnt}/PRIMARY-root.sqsh"; echo "KIND=sqsh"; ` +
        `elif [ -f ${qMnt}/PRIMARY-root.cpio.bz2 ]; then echo "IMG=${mnt}/PRIMARY-root.cpio.bz2"; echo "KIND=cpio_bz2"; ` +
        `else echo "IMG="; echo "KIND=unknown"; fi`,
      `umount ${qMnt} 2>/dev/null || true`,
    ].join('\n'), 30_000)
    if (probe.code !== 0 && probe.stdout.includes('MOUNT_FAIL')) {
      blockers.push('Impossible de monter la partition esos_root (lecture seule)')
    } else {
      const imgLine = probe.stdout.split('\n').find(l => l.startsWith('IMG='))
      const kindLine = probe.stdout.split('\n').find(l => l.startsWith('KIND='))
      const img = imgLine?.slice(4).trim()
      const kind = kindLine?.slice(5).trim()
      primaryImagePath = img || null
      if (kind === 'sqsh' || kind === 'cpio_bz2' || kind === 'unknown') imageKind = kind
      if (!primaryImagePath) blockers.push('Image ESOS PRIMARY-root introuvable sur la partition esos_root')
      if (imageKind === 'cpio_bz2') warnings.push('Système basé sur PRIMARY-root.cpio.bz2 détecté — v1 cible PRIMARY-root.sqsh (à adapter)')
    }
  }

  const ok = blockers.length === 0
  return {
    ok,
    blockers,
    warnings,
    detected: {
      esosRootPartitions: allParts,
      selectedRootPartition,
      hasDuplicateEsosRootLabel: hasDuplicate,
      primaryImagePath,
      imageKind,
      tmpFreeBytes,
      requiredCommands,
    },
  }
}

