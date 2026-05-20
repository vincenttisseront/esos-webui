/**
 * Validation for mdadm --add (spare or replacement member).
 */
import { createHash } from 'node:crypto'
import type { MdArray, RaidBlockDevice, RaidToolsInfo } from './raid-types'
import { collectActiveMdMemberPaths } from './raid-md-detection'
import { sanitizeDevicePath, sanitizeMdArrayName } from './raid-md-validation'
import {
  arrayNeedsReplacementMember,
  arraySupportsSpareAdd,
  isHealthyFullArray,
} from '../../utils/md-array-add-member-ui'

export type MdAddMemberIntent = 'spare' | 'replacement'

export interface MdAddDeviceValidationResult {
  ok: boolean
  blockers: string[]
  warnings: string[]
  impactedDevices: string[]
  commandPreview?: string
  arrayPath?: string
}

export function buildMdAddDeviceCommand(arrayPath: string, device: string): string {
  const arr = arrayPath.startsWith('/dev/') ? arrayPath : `/dev/${sanitizeMdArrayName(arrayPath)}`
  const dev = sanitizeDevicePath(device)
  return `mdadm ${arr} --add ${dev}`
}

export function expectedMdAddSpareConfirmation(arrayName: string, device: string): string {
  return `ADD SPARE ${sanitizeMdArrayName(arrayName)} ${sanitizeDevicePath(device)}`
}

export function expectedMdAddReplacementConfirmation(arrayName: string, device: string): string {
  return `ADD REPLACEMENT ${sanitizeMdArrayName(arrayName)} ${sanitizeDevicePath(device)}`
}

export function expectedClusterAddMdMemberConfirmation(arrayName: string, intent: MdAddMemberIntent): string {
  const kind = intent === 'spare' ? 'SPARE' : 'REPLACEMENT'
  return `ADD MD MEMBER CLUSTER ${kind} ${sanitizeMdArrayName(arrayName)}`
}

export function computeAddMdMemberPlanToken(input: {
  arrayName: string
  intent: MdAddMemberIntent
  primarySanId: string
  device: string
  nodeSanIds: string[]
}): string {
  const payload = JSON.stringify({
    action: 'md_add_device',
    arrayName: input.arrayName,
    intent: input.intent,
    primarySanId: input.primarySanId,
    device: input.device,
    nodes: input.nodeSanIds.sort(),
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

export function validateMdAddDeviceRequest(input: {
  name?: string
  device?: string
  intent?: MdAddMemberIntent
  blockDevices?: RaidBlockDevice[]
  mdArrays?: MdArray[]
  tools?: RaidToolsInfo
}): MdAddDeviceValidationResult {
  const blockers: string[] = []
  const warnings: string[] = []
  const impactedDevices: string[] = []

  let arrayName = ''
  try {
    arrayName = sanitizeMdArrayName(String(input.name ?? ''))
  } catch (err: any) {
    blockers.push(err?.statusMessage ?? 'Nom de tableau MD invalide')
  }

  let devicePath = ''
  try {
    devicePath = sanitizeDevicePath(String(input.device ?? ''))
  } catch (err: any) {
    blockers.push(err?.statusMessage ?? 'Chemin de partition invalide')
  }

  const intent = input.intent
  if (intent !== 'spare' && intent !== 'replacement') {
    blockers.push('Intent invalide : spare ou replacement requis')
  }

  const mdArrays = input.mdArrays ?? []
  const blockDevices = input.blockDevices ?? []
  const tools = input.tools

  if (tools && !tools.mdadm) {
    blockers.push('mdadm indisponible sur ce nœud')
  }

  const arr = mdArrays.find(a => a.name === arrayName || a.path === `/dev/${arrayName}`)
  if (!arrayName || !arr) {
    blockers.push(`Tableau MD ${arrayName || '(inconnu)'} introuvable sur ce nœud`)
  } else if (intent) {
    const arrayPath = arr.path
    impactedDevices.push(arrayPath)
    if (intent === 'spare') {
      if (arrayNeedsReplacementMember(arr)) {
        blockers.push('Le tableau nécessite un remplacement de membre, pas un spare')
      } else if (!arraySupportsSpareAdd(arr)) {
        blockers.push(`RAID${arr.raidLevel} ne prend pas en charge l\'ajout de spare via cette action`)
      } else if (!isHealthyFullArray(arr)) {
        blockers.push('Le tableau doit être sain et complet pour ajouter un spare')
      }
      if (arr.spareDevices > 0) {
        warnings.push('Un ou plusieurs spare(s) sont déjà présents sur ce tableau')
      }
    } else if (intent === 'replacement') {
      if (!arrayNeedsReplacementMember(arr)) {
        blockers.push('Aucun membre manquant ou défaillant détecté : utilisez l\'ajout de spare si le tableau est sain')
      }
      if (arr.state === 'recovering' || arr.state === 'resync' || arr.progress) {
        warnings.push('Resynchronisation en cours — vérifiez l\'état avant d\'ajouter un membre')
      }
    }

    if (devicePath) {
      impactedDevices.push(devicePath)
      const activeMembers = collectActiveMdMemberPaths(mdArrays)
      if (activeMembers.has(devicePath)) {
        blockers.push(`${devicePath} est déjà membre d\'un tableau MD actif`)
      }
      const dev = blockDevices.find(d => d.path === devicePath)
      if (!dev) {
        blockers.push(`${devicePath} introuvable dans l\'inventaire`)
      } else {
        if (dev.type !== 'part') {
          blockers.push('Seules les partitions préparées sont acceptées (pas de disque entier)')
        }
        if (!dev.eligibleForMd) {
          blockers.push(...(dev.mdEligibilityReasons.length ? dev.mdEligibilityReasons : ['Partition non éligible comme membre MD']))
        }
      }
    }

    return {
      ok: blockers.length === 0,
      blockers,
      warnings,
      impactedDevices: [...new Set(impactedDevices)],
      commandPreview: blockers.length === 0 && devicePath
        ? buildMdAddDeviceCommand(arrayPath, devicePath)
        : undefined,
      arrayPath: arr.path,
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    impactedDevices: [...new Set(impactedDevices)],
  }
}
