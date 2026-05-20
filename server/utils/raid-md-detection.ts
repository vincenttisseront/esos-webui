/**
 * Unified MD metadata detection for overview, preflight, and UI.
 */
import type {
  MdArray,
  RaidBlockDevice,
  StoppedMdArray,
} from './raid-types'

export type MdDetectionKind =
  | 'active_kernel'
  | 'stopped_scan'
  | 'stopped_examine'
  | 'block_device_raid'
  | 'partition_metadata'

export type MdDetectionUiAnchor = 'software-active' | 'software-stopped' | 'devices' | 'preflight'

export type MdDetectionRecommendedAction =
  | 'assemble'
  | 'zero_superblock'
  | 'advanced_cleanup'
  | 'inspect'
  | 'none'

export interface MdDetectionItem {
  kind: MdDetectionKind
  path: string
  nodeSanId: string
  nodeLabel: string
  severity: 'info' | 'warning' | 'blocking'
  summary: string
  reasons: string[]
  recommendedAction?: MdDetectionRecommendedAction
  uiAnchor: MdDetectionUiAnchor
  relatedArrayPath?: string
}

export interface MdDetectionSummary {
  nodeSanId: string
  nodeLabel: string
  hasAnyMdState: boolean
  items: MdDetectionItem[]
}

export type PreflightBlockerCode =
  | 'md_array_exists'
  | 'md_block_device_exists'
  | 'md_superblock_on_partition'
  | 'other'

export interface PreflightBlockerRef {
  code: PreflightBlockerCode
  message: string
  path?: string
  sanId?: string
  uiAnchor: MdDetectionUiAnchor
}

export function isLinuxRaidPartition(partitionTypeCode?: string, partitionTypeName?: string): boolean {
  const code = partitionTypeCode?.toLowerCase()
  const name = partitionTypeName?.toLowerCase() ?? ''
  return code === '0xfd'
    || code === 'fd'
    || code === 'a19d880f-05fc-4d3b-a006-743f0f84911e'
    || name.includes('linux raid')
    || name.includes('raid autodetect')
}

export function getMdEligibilityReasons(input: {
  type: RaidBlockDevice['type']
  usedBy: RaidBlockDevice['usedBy']
  partitionTypeCode?: string
  partitionTypeName?: string
  hasMdSuperblock: boolean
  mountpoint?: string
}): string[] {
  const reasons: string[] = []
  if (input.type !== 'part') reasons.push('Seules les partitions existantes sont éligibles')
  if (!isLinuxRaidPartition(input.partitionTypeCode, input.partitionTypeName)) {
    reasons.push('Type de partition Linux RAID Autodetect requis')
  }
  if (input.mountpoint) reasons.push(`Monté sur ${input.mountpoint}`)
  if (input.usedBy.includes('filesystem')) reasons.push('Système de fichiers détecté')
  if (input.usedBy.includes('lvm')) reasons.push('PV LVM détecté')
  if (input.usedBy.includes('scst')) reasons.push('Utilisé par SCST')
  if (input.usedBy.includes('md')) {
    reasons.push(input.hasMdSuperblock ? 'Superblock MD existant détecté' : 'Déjà membre MD')
  }
  if (input.usedBy.includes('unknown_signature')) reasons.push('Signature existante non autorisée')
  return [...new Set(reasons)]
}

export function getMdEligibilityReasonsForDevice(dev: RaidBlockDevice): string[] {
  if (dev.mdEligibilityReasons?.length) return [...dev.mdEligibilityReasons]
  return getMdEligibilityReasons({
    type: dev.type,
    usedBy: dev.usedBy,
    partitionTypeCode: dev.partitionTypeCode,
    partitionTypeName: dev.partitionTypeName,
    hasMdSuperblock: !!dev.hasMdSuperblock,
    mountpoint: dev.mountpoint,
  })
}

const MD_ARRAY_PATH_RE = /^\/dev\/md[a-z0-9_-]{0,15}$/

/** Partition paths that are sync members of an active kernel MD array (not orphan metadata). */
export function collectActiveMdMemberPaths(mdArrays: MdArray[]): Set<string> {
  const paths = new Set<string>()
  for (const arr of mdArrays) {
    for (const member of arr.members) {
      const path = member.path?.trim()
      if (path && path !== '—') paths.add(path)
    }
  }
  return paths
}

export function buildMdDetectionSummary(input: {
  nodeSanId: string
  nodeLabel: string
  mdArrays: MdArray[]
  stoppedMdArrays: StoppedMdArray[]
  blockDevices: RaidBlockDevice[]
}): MdDetectionSummary {
  const { nodeSanId, nodeLabel, mdArrays, stoppedMdArrays, blockDevices } = input
  const items: MdDetectionItem[] = []
  const activePaths = new Set(mdArrays.map(a => a.path))
  const activeMemberPaths = collectActiveMdMemberPaths(mdArrays)
  const stoppedMemberPaths = new Set(
    stoppedMdArrays.flatMap(a =>
      a.members.filter(m => m.present && m.path && m.path !== '—').map(m => m.path),
    ),
  )
  const coveredPaths = new Set<string>()

  for (const arr of mdArrays) {
    coveredPaths.add(arr.path)
    items.push({
      kind: 'active_kernel',
      path: arr.path,
      nodeSanId,
      nodeLabel,
      severity: arr.state === 'degraded' || arr.state === 'failed' ? 'warning' : 'info',
      summary: `Tableau MD actif ${arr.path} (${arr.state})`,
      reasons: [],
      recommendedAction: 'none',
      uiAnchor: 'software-active',
      relatedArrayPath: arr.path,
    })
  }

  for (const arr of stoppedMdArrays) {
    const arrayPath = arr.path ?? (arr.name && arr.name !== 'unknown' ? `/dev/${arr.name}` : undefined)
    const presentMembers = arr.members.filter(m => m.present && m.path && m.path !== '—')

    if (presentMembers.length === 0 && (arrayPath || arr.detectedOn === 'scan' || arr.detectedOn === 'both')) {
      const path = arrayPath ?? `/dev/${arr.name}`
      if (!activePaths.has(path)) {
        coveredPaths.add(path)
        items.push({
          kind: 'stopped_scan',
          path,
          nodeSanId,
          nodeLabel,
          severity: 'warning',
          summary: `Tableau MD arrêté détecté (scan) : ${path}`,
          reasons: arr.warnings,
          recommendedAction: arr.stoppedState === 'assemblable' ? 'assemble' : 'inspect',
          uiAnchor: 'software-stopped',
          relatedArrayPath: path,
        })
      }
    }

    for (const member of presentMembers) {
      if (activeMemberPaths.has(member.path)) continue
      coveredPaths.add(member.path)
      items.push({
        kind: 'stopped_examine',
        path: member.path,
        nodeSanId,
        nodeLabel,
        severity: 'warning',
        summary: `Métadonnées MD sur ${member.path} (${member.memberStatus})`,
        reasons: member.mdExamine?.uuid ? [`UUID ${member.mdExamine.uuid}`] : [],
        recommendedAction:
          member.memberStatus === 'orphan_metadata'
            ? 'zero_superblock'
            : arr.stoppedState === 'assemblable'
              ? 'assemble'
              : 'inspect',
        uiAnchor: 'software-stopped',
        relatedArrayPath: arrayPath,
      })
    }
  }

  for (const dev of blockDevices) {
    if (dev.type === 'raid' && MD_ARRAY_PATH_RE.test(dev.path) && !activePaths.has(dev.path)) {
      if (!coveredPaths.has(dev.path)) {
        coveredPaths.add(dev.path)
        items.push({
          kind: 'block_device_raid',
          path: dev.path,
          nodeSanId,
          nodeLabel,
          severity: 'warning',
          summary: `Périphérique MD ${dev.path} présent sans tableau actif dans le noyau`,
          reasons: dev.warnings ?? [],
          recommendedAction: 'inspect',
          uiAnchor: 'software-stopped',
          relatedArrayPath: dev.path,
        })
      }
    }
  }

  for (const dev of blockDevices) {
    if (dev.type !== 'part') continue
    if (!dev.hasMdSuperblock && !dev.usedBy.includes('md')) continue
    if (stoppedMemberPaths.has(dev.path)) continue
    if (activeMemberPaths.has(dev.path)) continue
    const reasons = getMdEligibilityReasonsForDevice(dev)
    items.push({
      kind: 'partition_metadata',
      path: dev.path,
      nodeSanId,
      nodeLabel,
      severity: 'blocking',
      summary: `Métadonnées MD sur partition ${dev.path}`,
      reasons,
      recommendedAction: 'zero_superblock',
      uiAnchor: 'devices',
      relatedArrayPath: undefined,
    })
  }

  return {
    nodeSanId,
    nodeLabel,
    hasAnyMdState: items.length > 0,
    items,
  }
}

export function buildCreateMdBlockerRefs(input: {
  sanId: string
  name: string
  mdArrays: MdArray[]
  blockDevices: RaidBlockDevice[]
  deviceBlockers: Array<{ path: string; reasons: string[] }>
}): PreflightBlockerRef[] {
  const refs: PreflightBlockerRef[] = []
  const arrayPath = input.name ? `/dev/${input.name}` : ''

  if (arrayPath) {
    if (input.mdArrays.some(a => a.name === input.name || a.path === arrayPath)) {
      refs.push({
        code: 'md_array_exists',
        message: `${arrayPath} existe déjà comme tableau MD`,
        path: arrayPath,
        sanId: input.sanId,
        uiAnchor: 'software-active',
      })
    }
    if (input.blockDevices.some(d => d.path === arrayPath)) {
      refs.push({
        code: 'md_block_device_exists',
        message: `${arrayPath} existe déjà comme block device`,
        path: arrayPath,
        sanId: input.sanId,
        uiAnchor: 'software-stopped',
      })
    }
  }

  for (const { path, reasons } of input.deviceBlockers) {
    const mdReason = reasons.find(r =>
      r.includes('Superblock MD') || r.includes('membre MD') || r.includes('Déjà membre'),
    )
    if (mdReason) {
      refs.push({
        code: 'md_superblock_on_partition',
        message: `${path} : ${mdReason}`,
        path,
        sanId: input.sanId,
        uiAnchor: 'devices',
      })
    }
  }

  return refs
}

export function prefixBlockerRefs(
  refs: PreflightBlockerRef[],
  nodeLabel: string,
  nodeSanId: string,
): PreflightBlockerRef[] {
  return refs.map(r => ({
    ...r,
    message: `${nodeLabel} : ${r.message}`,
    sanId: nodeSanId,
  }))
}

export function detectionPathsSet(summary: MdDetectionSummary | undefined): Set<string> {
  const paths = new Set<string>()
  if (!summary) return paths
  for (const item of summary.items) paths.add(item.path)
  return paths
}
