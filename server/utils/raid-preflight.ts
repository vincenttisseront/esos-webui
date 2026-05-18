/**
 * Vérifications préflight avant toute action RAID (SDD v3.12 §4.3, §8.2).
 */
import type { SSHSessionManager } from './ssh-session-manager'
import type {
  RaidPreflightResult, RaidPreflightRequest, RaidRiskLevel,
  RaidBlockDevice, MdArray, RaidToolsInfo, StoppedMdArray,
} from './raid-types'
import { expectedMdCreateConfirmation, validateMdCreateRequest } from './raid-md-validation'
import { PREPARE_MD_PARTITIONS_CONFIRMATION, validatePrepareMdPartitionsRequest } from './raid-md-partition-actions'
import { buildMdAssembleCommand, expectedMdAssembleConfirmation, expectedMdZeroSuperblocksConfirmation } from './raid-md-actions'

const RISK_MAP: Record<RaidPreflightRequest['action'], RaidRiskLevel> = {
  create_hw_ld:    'risky',
  delete_hw_ld:    'destructive',
  add_hotspare:    'safe',
  remove_hotspare: 'safe',
  create_md:       'risky',
  prepare_md_partitions: 'destructive',
  stop_md:         'destructive',
  assemble_md:     'risky',
  zero_md_superblocks: 'destructive',
  md_add_device:   'safe',
  md_set_faulty:   'risky',
  md_remove_device:'destructive',
}

/**
 * Exécute le préflight via SSH et retourne le résultat.
 */
export async function runPreflight(
  _manager: SSHSessionManager,
  req: RaidPreflightRequest,
  blockDevices: RaidBlockDevice[],
  mdArrays: MdArray[],
  tools?: RaidToolsInfo,
  stoppedMdArrays: StoppedMdArray[] = [],
): Promise<RaidPreflightResult> {
  const riskLevel = RISK_MAP[req.action]
  const blockers: string[] = []
  const warnings: string[] = []
  const impactedDevices: string[] = []
  const detectedUsage: Record<string, string[]> = {}

  const payload = req.payload as Record<string, unknown>

  switch (req.action) {
    case 'create_md': {
      const validation = validateMdCreateRequest(payload, blockDevices, mdArrays)
      blockers.push(...validation.blockers)
      warnings.push(...validation.warnings)
      impactedDevices.push(...validation.impactedDevices)
      Object.assign(detectedUsage, validation.detectedUsage)
      const ok = blockers.length === 0
      return {
        ok,
        riskLevel,
        blockers,
        warnings,
        requiredConfirmation: buildConfirmationPhrase(req),
        impactedDevices,
        detectedUsage,
        commandPreview: validation.commandPreview,
        candidateChecks: validation.candidateChecks,
      }
    }
    case 'prepare_md_partitions': {
      const validation = validatePrepareMdPartitionsRequest(payload, blockDevices, tools ?? emptyTools())
      blockers.push(...validation.blockers)
      warnings.push(...validation.warnings)
      impactedDevices.push(...validation.impactedDevices)
      Object.assign(detectedUsage, validation.detectedUsage)
      return {
        ok: blockers.length === 0,
        riskLevel,
        blockers,
        warnings,
        requiredConfirmation: buildConfirmationPhrase(req),
        impactedDevices,
        detectedUsage,
        commandPreview: validation.commandPreview,
        partitionTableRequested: validation.partitionTableRequested,
        partitionTableResolved: validation.partitionTableResolved,
        diskChecks: validation.diskChecks,
        preparedPartitionPreview: validation.preparedPartitionPreview,
      }
    }
    case 'stop_md': {
      const arrName = String(payload.name ?? '')
      const arr = mdArrays.find(a => a.name === arrName || a.path === arrName)
      if (!arr) {
        blockers.push(`Array ${arrName} introuvable`)
      } else {
        impactedDevices.push(arr.path)
        if (arr.usedBy.includes('mounted')) blockers.push(`${arr.path} est monté, démontez-le d'abord`)
        if (arr.usedBy.includes('lvm')) blockers.push(`${arr.path} est utilisé par LVM`)
        if (arr.usedBy.includes('scst')) blockers.push(`${arr.path} est utilisé par SCST (retirez le device SCST d'abord)`)
        if (arr.state === 'recovering' || arr.state === 'resync') {
          warnings.push(`Array en cours de rebuild/resync — arrêter maintenant peut corrompre les données`)
        }
      }
      break
    }
    case 'assemble_md': {
      const arrName = String(payload.name ?? '')
      const members = (payload.members as string[] | undefined) ?? []
      const stopped = findStoppedMdArray(stoppedMdArrays, arrName, payload.uuid as string | undefined)
      if (mdArrays.some(a => a.name === arrName)) {
        blockers.push(`Le tableau ${arrName} est déjà actif`)
      }
      if (!stopped) {
        blockers.push(`Tableau MD arrêté ${arrName} introuvable sur ce nœud`)
      } else {
        impactedDevices.push(...stopped.members.map(m => m.path))
        if (stopped.stoppedState === 'incomplete' && members.length < stopped.raidDevices) {
          warnings.push('Ensemble de membres incomplet — l\'assemblage peut démarrer en mode dégradé')
        }
        if (stopped.stoppedState === 'ambiguous') {
          blockers.push('État du tableau ambigu — vérifiez les métadonnées avant assemblage')
        }
        for (const memberPath of members.length ? members : stopped.members.map(m => m.path)) {
          const dev = blockDevices.find(d => d.path === memberPath)
          if (!dev) continue
          if (dev.usedBy.includes('mounted')) blockers.push(`${memberPath} est monté`)
          if (dev.usedBy.includes('lvm')) blockers.push(`${memberPath} est utilisé par LVM`)
          if (dev.usedBy.includes('scst')) blockers.push(`${memberPath} est utilisé par SCST`)
        }
      }
      const commandPreview = members.length > 0
        ? buildMdAssembleCommand(arrName, members)
        : buildMdAssembleCommand(arrName, stopped?.members.map(m => m.path) ?? [])
      return {
        ok: blockers.length === 0,
        riskLevel,
        blockers,
        warnings,
        requiredConfirmation: buildConfirmationPhrase(req),
        impactedDevices,
        detectedUsage,
        commandPreview,
      }
    }
    case 'zero_md_superblocks': {
      const arrName = String(payload.name ?? 'md0')
      const members = (payload.members as string[] | undefined) ?? []
      if (members.length === 0) {
        blockers.push('Au moins une partition membre est requise')
      }
      if (mdArrays.some(a => a.name === arrName)) {
        blockers.push(`Le tableau ${arrName} est encore actif — arrêtez-le avant de nettoyer les métadonnées`)
      }
      impactedDevices.push(...members)
      for (const memberPath of members) {
        const dev = blockDevices.find(d => d.path === memberPath)
        if (!dev) {
          blockers.push(`Partition introuvable : ${memberPath}`)
          continue
        }
        if (dev.usedBy.includes('mounted')) blockers.push(`${memberPath} est monté`)
        if (!dev.hasMdSuperblock && !dev.mdExamine) {
          warnings.push(`${memberPath} : aucun superblock MD détecté`)
        }
      }
      warnings.push('Cette action supprime les métadonnées RAID sur les partitions sélectionnées (destructif)')
      const commandPreview = members.map(m => `mdadm --zero-superblock ${m}`).join('\n')
      return {
        ok: blockers.length === 0,
        riskLevel,
        blockers,
        warnings,
        requiredConfirmation: buildConfirmationPhrase(req),
        impactedDevices,
        detectedUsage,
        commandPreview,
      }
    }
    case 'md_remove_device': {
      const member = String(payload.device ?? '')
      impactedDevices.push(member)
      warnings.push('Vérifiez que le membre a été préalablement marqué faulty')
      break
    }
    case 'delete_hw_ld': {
      const ldId = String(payload.id ?? '')
      impactedDevices.push(ldId)
      blockers.push('Vérifiez manuellement que ce volume logique n\'est pas utilisé par SCST/LVM/FS avant de continuer')
      warnings.push('Cette action détruira définitivement les données sur ce volume logique')
      break
    }
    case 'create_hw_ld': {
      const drives = (payload.drives as Array<Record<string, string>> | undefined) ?? []
      for (const d of drives) {
        impactedDevices.push(`slot ${d.slot}`)
      }
      break
    }
    default:
      break
  }

  const ok = blockers.length === 0
  const requiredConfirmation = buildConfirmationPhrase(req)

  return { ok, riskLevel, blockers, warnings, requiredConfirmation, impactedDevices, detectedUsage }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildConfirmationPhrase(req: RaidPreflightRequest): string {
  const payload = req.payload as Record<string, unknown>
  switch (req.action) {
    case 'create_md':
      try {
        return expectedMdCreateConfirmation(String(payload.name ?? 'md0'))
      } catch {
        return `CREATE ${String(payload.name ?? 'md0')}`
      }
    case 'prepare_md_partitions':
      return PREPARE_MD_PARTITIONS_CONFIRMATION
    case 'stop_md':
      return `STOP ${String(payload.name ?? 'md0')}`
    case 'assemble_md':
      try {
        return expectedMdAssembleConfirmation(String(payload.name ?? 'md0'))
      } catch {
        return `ASSEMBLE ${String(payload.name ?? 'md0')}`
      }
    case 'zero_md_superblocks':
      try {
        return expectedMdZeroSuperblocksConfirmation(String(payload.name ?? 'md0'))
      } catch {
        return `ZERO_SUPERBLOCK ${String(payload.name ?? 'md0')}`
      }
    case 'delete_hw_ld':
      return `DELETE LD ${String(payload.id ?? '0')}`
    case 'md_remove_device':
      return `REMOVE ${String(payload.device ?? '')}`
    case 'md_set_faulty':
      return `FAULTY ${String(payload.device ?? '')}`
    default:
      return 'CONFIRM'
  }
}

function findStoppedMdArray(
  stoppedMdArrays: StoppedMdArray[],
  name: string,
  uuid?: string,
): StoppedMdArray | undefined {
  return stoppedMdArrays.find(arr =>
    arr.name === name
    || arr.path === `/dev/${name}`
    || (uuid && arr.uuid === uuid),
  )
}

function emptyTools(): RaidToolsInfo {
  return {
    mdadm: false,
    lspci: false,
    storcli: false,
    perccli: false,
    MegaCli64: false,
    arcconf: false,
    lsscsi: false,
    wipefs: false,
    parted: false,
    sfdisk: false,
    fdisk: false,
    partprobe: false,
    udevadm: false,
  }
}
