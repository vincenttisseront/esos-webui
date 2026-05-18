/**
 * Vérifications préflight avant toute action RAID (SDD v3.12 §4.3, §8.2).
 */
import type { SSHSessionManager } from './ssh-session-manager'
import type {
  RaidPreflightResult, RaidPreflightRequest, RaidRiskLevel,
  RaidBlockDevice, MdArray, RaidToolsInfo,
} from './raid-types'
import { expectedMdCreateConfirmation, validateMdCreateRequest } from './raid-md-validation'
import { PREPARE_MD_PARTITIONS_CONFIRMATION, validatePrepareMdPartitionsRequest } from './raid-md-partition-actions'

const RISK_MAP: Record<RaidPreflightRequest['action'], RaidRiskLevel> = {
  create_hw_ld:    'risky',
  delete_hw_ld:    'destructive',
  add_hotspare:    'safe',
  remove_hotspare: 'safe',
  create_md:       'risky',
  prepare_md_partitions: 'destructive',
  stop_md:         'destructive',
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
