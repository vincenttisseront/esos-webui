import { createError } from 'h3'
import type {
  MdPartitionDiskCheck,
  PrepareMdPartitionsRequest,
  PrepareMdPartitionsResponse,
  RaidBlockDevice,
  RaidToolsInfo,
} from './raid-types'
import type { SSHSessionManager } from './ssh-session-manager'

export const PREPARE_MD_PARTITIONS_CONFIRMATION = 'CREATE RAID PARTITIONS'

const WRITE_ENABLED = process.env.RAID_SOFTWARE_WRITE_ENABLED !== 'false'
  && process.env.RAID_WRITE_ACTIONS_ENABLED !== 'false'

export interface PrepareMdPartitionsValidation {
  blockers: string[]
  warnings: string[]
  impactedDevices: string[]
  detectedUsage: Record<string, string[]>
  diskChecks: MdPartitionDiskCheck[]
  preparedPartitionPreview: Array<{ disk: string; expectedPartitionPath: string }>
  partitionTableRequested: 'auto' | 'gpt' | 'dos'
  partitionTableResolved?: 'gpt' | 'dos'
  commandPreview?: string
  commands: string[]
}

export function validatePrepareMdPartitionsRequest(
  req: Partial<PrepareMdPartitionsRequest>,
  blockDevices: RaidBlockDevice[],
  tools: RaidToolsInfo,
): PrepareMdPartitionsValidation {
  const blockers: string[] = []
  const warnings: string[] = []
  const impactedDevices: string[] = []
  const detectedUsage: Record<string, string[]> = {}
  const diskChecks: MdPartitionDiskCheck[] = []
  const preparedPartitionPreview: Array<{ disk: string; expectedPartitionPath: string }> = []
  const disks = Array.isArray(req.disks) ? req.disks : []
  const rawPartitionTable = req.partitionTable ?? 'auto'
  const partitionTable = normalizePartitionTable(req.partitionTable)
  const allowOverwriteSignatures = req.allowOverwriteSignatures === true

  if (disks.length === 0) blockers.push('Au moins un disque est requis')
  if (!['auto', 'gpt', 'dos'].includes(rawPartitionTable)) {
    blockers.push(`Type de table de partitions invalide : ${String(rawPartitionTable)}`)
  }

  const strategy = resolvePartitionStrategy(partitionTable, tools)
  if (!strategy) {
    blockers.push('Aucun outil de partitionnement scriptable disponible (parted ou sfdisk requis)')
  } else if (strategy === 'gpt' && !tools.parted) {
    blockers.push('parted est requis pour créer une table GPT avec flag RAID')
  } else if (strategy === 'dos' && !tools.sfdisk) {
    blockers.push('sfdisk est requis pour créer une table MBR type fd')
  }

  const seen = new Set<string>()
  const commands: string[] = []

  for (const diskPath of disks) {
    impactedDevices.push(diskPath)
    if (!isSafeDiskPath(diskPath)) {
      blockers.push(`Chemin disque invalide : ${diskPath}`)
      continue
    }
    if (seen.has(diskPath)) {
      blockers.push(`${diskPath} est sélectionné plusieurs fois`)
      continue
    }
    seen.add(diskPath)

    const disk = blockDevices.find(d => d.path === diskPath)
    const reasons: string[] = []
    if (!disk) {
      reasons.push('Disque introuvable dans le scan actuel')
    } else {
      if (disk.type !== 'disk') reasons.push('Seuls les disques entiers sont éligibles')
      if (disk.mdPartitionPrepReasons.length > 0) reasons.push(...disk.mdPartitionPrepReasons)
      if (!disk.eligibleForMdPartitionPrep && disk.mdPartitionPrepReasons.length === 0) {
        reasons.push('Disque non éligible pour la préparation MD')
      }
      if (disk.usedBy.length > 0) detectedUsage[diskPath] = [...disk.usedBy]
    }

    const signatures = [...new Set(disk?.diskSignatures ?? disk?.wipefsSignatures ?? [])]
    const childrenPaths = disk?.childrenPaths ?? []
    const hasOverwriteableContent = signatures.length > 0 || childrenPaths.length > 0
    if (hasOverwriteableContent && !allowOverwriteSignatures) {
      reasons.push('Signatures ou partitions existantes détectées : confirmation destructive explicite requise')
    }

    const expectedPartitionPath = expectedFirstPartitionPath(diskPath)
    if (disk && strategy) {
      preparedPartitionPreview.push({ disk: diskPath, expectedPartitionPath })
      commands.push(...buildPrepareMdPartitionCommands(diskPath, strategy, tools))
    }

    diskChecks.push({
      path: diskPath,
      eligible: reasons.length === 0,
      sizeBytes: disk?.sizeBytes ?? 0,
      signatures,
      hasChildren: childrenPaths.length > 0,
      childrenPaths,
      willOverwritePartitionTable: hasOverwriteableContent,
      reasons: [...new Set(reasons)],
      expectedPartitionPath,
    })
    for (const reason of reasons) blockers.push(`${diskPath} : ${reason}`)
  }

  if (diskChecks.some(c => c.willOverwritePartitionTable)) {
    warnings.push('La table de partitions et les signatures existantes des disques sélectionnés seront remplacées')
  }

  return {
    blockers: [...new Set(blockers)],
    warnings,
    impactedDevices,
    detectedUsage,
    diskChecks,
    preparedPartitionPreview,
    partitionTableRequested: partitionTable,
    partitionTableResolved: strategy ?? undefined,
    commandPreview: blockers.length === 0 ? commands.join('\n') : undefined,
    commands,
  }
}

export function assertValidPrepareMdPartitionsRequest(
  req: PrepareMdPartitionsRequest,
  blockDevices: RaidBlockDevice[],
  tools: RaidToolsInfo,
): PrepareMdPartitionsValidation {
  const result = validatePrepareMdPartitionsRequest(req, blockDevices, tools)
  if (result.blockers.length > 0) {
    throw createError({ statusCode: 400, statusMessage: result.blockers.join('; ') })
  }
  return result
}

export async function prepareMdPartitions(
  manager: SSHSessionManager,
  req: PrepareMdPartitionsRequest,
  validation: PrepareMdPartitionsValidation,
): Promise<PrepareMdPartitionsResponse> {
  assertWriteEnabled()
  const outputs: string[] = []

  for (const command of validation.commands) {
    const { stdout } = await manager.exec(`${command} 2>&1; echo EXIT_CODE=$?`, 60_000)
    outputs.push(stdout)
    if (stdout.match(/EXIT_CODE=[1-9]/i) || stdout.match(/\b(error|failed)\b/i)) {
      throw createError({
        statusCode: 500,
        statusMessage: `Échec préparation partition RAID : ${stdout.slice(-500)}`,
        data: {
          command,
          stdout: outputs.join('\n').slice(0, 4000),
          commands: validation.commands,
        },
      })
    }
  }

  return {
    stdout: outputs.join('\n').slice(0, 4000),
    commands: validation.commands,
    preparedPartitions: validation.preparedPartitionPreview.map(p => p.expectedPartitionPath),
    refreshed: false,
  }
}

export function expectedFirstPartitionPath(diskPath: string): string {
  return /\/dev\/(?:nvme\d+n\d+|mmcblk\d+)$/.test(diskPath) ? `${diskPath}p1` : `${diskPath}1`
}

function buildPrepareMdPartitionCommands(
  diskPath: string,
  strategy: 'gpt' | 'dos',
  tools: RaidToolsInfo,
): string[] {
  const disk = sanitizeDiskPath(diskPath)
  const commands = strategy === 'gpt'
    ? [
        `parted -s ${disk} mklabel gpt`,
        `parted -s -a optimal ${disk} mkpart primary 1MiB 100%`,
        `parted -s ${disk} set 1 raid on`,
      ]
    : [
        `printf 'label: dos\\n, , fd\\n' | sfdisk ${disk}`,
      ]

  if (tools.partprobe) commands.push(`partprobe ${disk}`)
  if (tools.udevadm) commands.push('udevadm settle')
  return commands
}

function resolvePartitionStrategy(
  requested: PrepareMdPartitionsRequest['partitionTable'] = 'auto',
  tools: RaidToolsInfo,
): 'gpt' | 'dos' | null {
  if (requested === 'gpt') return tools.parted ? 'gpt' : null
  if (requested === 'dos') return tools.sfdisk ? 'dos' : null
  if (tools.parted) return 'gpt'
  if (tools.sfdisk) return 'dos'
  return null
}

function normalizePartitionTable(value: PrepareMdPartitionsRequest['partitionTable']): 'auto' | 'gpt' | 'dos' {
  return value === 'gpt' || value === 'dos' || value === 'auto' ? value : 'auto'
}

function assertWriteEnabled(): void {
  if (!WRITE_ENABLED) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Les actions RAID sont désactivées (RAID_WRITE_ACTIONS_ENABLED=false)',
    })
  }
}

function sanitizeDiskPath(diskPath: string): string {
  if (!isSafeDiskPath(diskPath)) {
    throw createError({ statusCode: 400, statusMessage: `Chemin disque invalide : ${diskPath}` })
  }
  return diskPath
}

function isSafeDiskPath(diskPath: string): boolean {
  return /^\/dev\/[a-z0-9_./-]{1,64}$/i.test(diskPath)
}
