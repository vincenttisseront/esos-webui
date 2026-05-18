/**
 * Détection des tableaux MD arrêtés / assemblables à partir des superblocks et du scan mdadm.
 */
import type {
  MdArray,
  MdExamineInfo,
  RaidBlockDevice,
  StoppedMdArray,
  StoppedMdArrayMember,
  StoppedMdCategory,
  StoppedMdConfidence,
  StoppedMdDisplayKind,
  StoppedMdRecommendedAction,
} from './raid-types'
import type { MdadmScanEntry } from './parsers/mdadm-scan.parser'
import { parseMdadmScanLines } from './parsers/mdadm-scan.parser'

type MdRaidLevel = StoppedMdArray['raidLevel']

interface MemberCandidate {
  path: string
  mdExamine?: MdExamineInfo
  hasMdSuperblock: boolean
}

interface ArrayGroup {
  key: string
  uuid?: string
  containerName?: string
  members: MemberCandidate[]
  scanEntry?: MdadmScanEntry
  detectedOn: Set<'examine' | 'scan'>
  warnings: string[]
}

const MD_NAME_RE = /^md\d+$/i

export function detectStoppedMdArrays(input: {
  mdadmScan: string
  blockDevices: RaidBlockDevice[]
  activeMdArrays: MdArray[]
}): StoppedMdArray[] {
  const scanEntries = parseMdadmScanLines(input.mdadmScan)
  const activePaths = new Set(input.activeMdArrays.map(a => a.path))
  const activeNames = new Set(input.activeMdArrays.map(a => a.name))
  const activeUuids = new Set(input.activeMdArrays.map(a => a.uuid).filter(Boolean) as string[])

  const orphanScanEntries = scanEntries.filter(entry =>
    !activePaths.has(entry.path) && !activeNames.has(entry.name),
  )

  const candidates = collectMemberCandidates(input.blockDevices, activePaths)
  const groups = buildGroups(candidates, orphanScanEntries, activeUuids)

  return groups
    .map(group => toStoppedMdArray(group, activePaths))
    .filter((arr): arr is StoppedMdArray => arr !== null)
    .sort((a, b) => a.id.localeCompare(b.id))
}

function collectMemberCandidates(
  blockDevices: RaidBlockDevice[],
  activePaths: Set<string>,
): MemberCandidate[] {
  const result: MemberCandidate[] = []
  for (const dev of blockDevices) {
    if (dev.type !== 'part') continue
    if (activePaths.has(dev.path)) continue
    const hasMdSuperblock = !!dev.hasMdSuperblock
      || dev.blkidType === 'linux_raid_member'
      || (dev.wipefsSignatures ?? []).includes('linux_raid_member')
    if (!hasMdSuperblock && !dev.mdExamine) continue
    result.push({
      path: dev.path,
      mdExamine: dev.mdExamine,
      hasMdSuperblock,
    })
  }
  return result
}

function buildGroups(
  candidates: MemberCandidate[],
  orphanScanEntries: MdadmScanEntry[],
  activeUuids: Set<string>,
): ArrayGroup[] {
  const groupMap = new Map<string, ArrayGroup>()

  const getOrCreate = (key: string, init: Partial<ArrayGroup>): ArrayGroup => {
    const existing = groupMap.get(key)
    if (existing) return existing
    const group: ArrayGroup = {
      key,
      members: [],
      detectedOn: new Set(),
      warnings: [],
      ...init,
    }
    groupMap.set(key, group)
    return group
  }

  for (const candidate of candidates) {
    const examine = candidate.mdExamine
    if (examine?.uuid && activeUuids.has(examine.uuid)) continue
    const key = examine?.uuid
      ? `uuid:${examine.uuid}`
      : examine?.name
        ? `name:${normalizeContainerName(examine.name)}`
        : `path:${candidate.path}`
    const group = getOrCreate(key, {
      uuid: examine?.uuid,
      containerName: examine?.name,
    })
    group.detectedOn.add('examine')
    if (!group.members.some(m => m.path === candidate.path)) {
      group.members.push(candidate)
    }
  }

  for (const scanEntry of orphanScanEntries) {
    if (scanEntry.uuid && activeUuids.has(scanEntry.uuid)) continue
    const key = scanEntry.uuid
      ? `uuid:${scanEntry.uuid}`
      : scanEntry.containerName
        ? `name:${normalizeContainerName(scanEntry.containerName)}`
        : `path:${scanEntry.path}`
    const group = getOrCreate(key, {
      uuid: scanEntry.uuid,
      containerName: scanEntry.containerName,
      scanEntry,
    })
    group.detectedOn.add('scan')
    if (scanEntry.scanLine && !group.scanEntry) group.scanEntry = scanEntry
  }

  mergeGroupsByUuidOrName(groupMap)
  return [...groupMap.values()]
}

function mergeGroupsByUuidOrName(groupMap: Map<string, ArrayGroup>): void {
  const byUuid = new Map<string, string[]>()
  const byName = new Map<string, string[]>()
  for (const key of groupMap.keys()) {
    const group = groupMap.get(key)!
    if (group.uuid) {
      byUuid.set(group.uuid, [...(byUuid.get(group.uuid) ?? []), key])
    }
    if (group.containerName) {
      const normalized = normalizeContainerName(group.containerName)
      byName.set(normalized, [...(byName.get(normalized) ?? []), key])
    }
  }
  for (const keys of [...byUuid.values(), ...byName.values()]) {
    if (keys.length < 2) continue
    const primaryKey = keys[0]
    const primary = groupMap.get(primaryKey)!
    for (const otherKey of keys.slice(1)) {
      const other = groupMap.get(otherKey)
      if (!other) continue
      primary.warnings.push(`Groupes fusionnés : ${otherKey}`)
      for (const member of other.members) {
        if (!primary.members.some(m => m.path === member.path)) {
          primary.members.push(member)
        }
      }
      if (other.scanEntry && !primary.scanEntry) primary.scanEntry = other.scanEntry
      other.detectedOn.forEach(v => primary.detectedOn.add(v))
      groupMap.delete(otherKey)
    }
  }
}

function toStoppedMdArray(group: ArrayGroup, activePaths: Set<string>): StoppedMdArray | null {
  if (group.members.length === 0 && !group.scanEntry) return null

  const scanEntry = group.scanEntry
  const scanPath = scanEntry?.path
  const mdNameFromScan = scanEntry?.name
  const mdNameInferred = inferMdNameFromContainer(group.containerName)
  const mdNameCandidate = mdNameFromScan ?? mdNameInferred ?? (scanPath ? scanPath.replace(/^\/dev\//, '') : undefined)
  const mdNameKnown = mdNameCandidate ? MD_NAME_RE.test(mdNameCandidate) : false
  const mdName = mdNameKnown ? mdNameCandidate! : ''

  if (activePaths.has(scanPath ?? '') && group.members.length === 0) {
    return null
  }

  const raidLevelResult = parseRaidLevel(
    group.members.find(m => m.mdExamine?.raidLevel)?.mdExamine?.raidLevel,
  )
  const examineRaidDeviceCounts = group.members
    .map(m => m.mdExamine?.raidDevices)
    .filter((count): count is number => typeof count === 'number' && count > 0)
  const expectedDevices = examineRaidDeviceCounts.length > 0
    ? Math.max(...examineRaidDeviceCounts)
    : group.members.length

  const members: StoppedMdArrayMember[] = group.members.map(member => ({
    path: member.path,
    mdExamine: member.mdExamine,
    present: true,
  }))

  const stoppedState = computeStoppedState({
    members,
    expectedDevices,
    path: scanPath,
    activePaths,
    warnings: group.warnings,
  })

  const detectedOn = group.detectedOn.size === 2
    ? 'both'
    : group.detectedOn.has('scan')
      ? 'scan'
      : 'examine'

  const uuid = group.uuid ?? scanEntry?.uuid
  const id = buildStoppedArrayId(group, uuid, members)

  const base: Omit<StoppedMdArray, 'displayKind' | 'displaySubtitle' | 'category' | 'recommendedAction' | 'confidence' | 'missingSummary' | 'raidLevelKnown' | 'arrayTargetPath' | 'canAssemble' | 'canZeroSuperblocks'> = {
    id,
    name: mdName,
    path: scanPath,
    uuid,
    raidLevel: raidLevelResult.level,
    raidDevices: Math.max(expectedDevices, members.length, 1),
    metadataVersion: scanEntry?.metadataVersion,
    members,
    stoppedState,
    scanLine: scanEntry?.scanLine,
    warnings: [...new Set(group.warnings)],
    detectedOn,
  }

  const ux = deriveStoppedMdUxFields({
    ...base,
    mdNameKnown,
    scanPath,
    containerName: group.containerName,
    expectedDevices,
  })

  return { ...base, ...ux }
}

export function deriveStoppedMdUxFields(input: {
  id: string
  name: string
  path?: string
  uuid?: string
  raidLevel: MdRaidLevel
  raidDevices: number
  members: StoppedMdArrayMember[]
  stoppedState: StoppedMdArray['stoppedState']
  warnings: string[]
  detectedOn: StoppedMdArray['detectedOn']
  mdNameKnown: boolean
  scanPath?: string
  containerName?: string
  expectedDevices: number
}): Pick<
  StoppedMdArray,
  | 'displayKind'
  | 'displaySubtitle'
  | 'category'
  | 'recommendedAction'
  | 'confidence'
  | 'missingSummary'
  | 'raidLevelKnown'
  | 'arrayTargetPath'
  | 'canAssemble'
  | 'canZeroSuperblocks'
> {
  const presentCount = input.members.filter(m => m.present).length
  const raidLevelKnown = input.raidLevel !== 'unknown'
  const arrayTargetPath = input.scanPath ?? (input.mdNameKnown ? `/dev/${input.name}` : undefined)

  const isOrphan = !input.mdNameKnown
    || (input.members.length === 1 && !input.scanPath && input.detectedOn === 'examine')
    || (input.members.length === 0 && !!input.scanPath)
    || (input.stoppedState === 'ambiguous' && !input.mdNameKnown)

  const isAssemblable = input.stoppedState === 'assemblable'
    && input.mdNameKnown
    && !!arrayTargetPath
    && presentCount >= input.expectedDevices
    && input.expectedDevices > 0

  let category: StoppedMdCategory
  if (isOrphan && !isAssemblable) {
    category = 'orphan'
  } else if (isAssemblable) {
    category = 'assemblable'
  } else {
    category = 'incomplete'
  }

  const missingSummary: string[] = []
  if (!input.mdNameKnown) {
    missingSummary.push('Nom du tableau MD inconnu')
  }
  if (input.expectedDevices > 0 && presentCount < input.expectedDevices) {
    missingSummary.push(`${input.expectedDevices - presentCount} membre(s) manquant(s) sur ${input.expectedDevices}`)
  }
  if (!raidLevelKnown) {
    missingSummary.push('Niveau RAID non déterminé')
  }
  if (input.stoppedState === 'ambiguous') {
    missingSummary.push('Métadonnées potentiellement conflictuelles')
  }
  if (input.members.length === 0 && input.scanPath) {
    missingSummary.push('Aucune partition membre détectée sur ce nœud')
  }

  let displayKind: StoppedMdDisplayKind
  if (category === 'orphan') {
    displayKind = 'orphan_metadata'
  } else if (!input.mdNameKnown) {
    displayKind = 'unknown_md_name'
  } else {
    displayKind = 'known_array'
  }

  let displaySubtitle: string | undefined
  if (arrayTargetPath) {
    displaySubtitle = arrayTargetPath
  } else if (input.uuid) {
    displaySubtitle = `UUID ${truncateUuid(input.uuid)}`
  } else if (input.members[0]?.path) {
    displaySubtitle = input.members[0].path
  } else if (input.containerName) {
    displaySubtitle = input.containerName
  }

  let confidence: StoppedMdConfidence = 'low'
  if (input.detectedOn === 'both' && input.uuid && input.mdNameKnown && raidLevelKnown) {
    confidence = 'high'
  } else if (input.uuid || input.scanPath || input.mdNameKnown) {
    confidence = 'medium'
  }

  const canAssemble = isAssemblable && category === 'assemblable'
  const canZeroSuperblocks = input.members.some(m => m.present)

  let recommendedAction: StoppedMdRecommendedAction
  if (canAssemble) {
    recommendedAction = 'assemble'
  } else if (category === 'orphan' || category === 'incomplete' || input.stoppedState === 'ambiguous') {
    recommendedAction = 'inspect'
  } else {
    recommendedAction = 'none'
  }

  return {
    displayKind,
    displaySubtitle,
    category,
    recommendedAction,
    confidence,
    missingSummary,
    raidLevelKnown,
    arrayTargetPath,
    canAssemble,
    canZeroSuperblocks,
  }
}

function buildStoppedArrayId(group: ArrayGroup, uuid?: string, members: StoppedMdArrayMember[] = []): string {
  if (uuid) return `uuid:${uuid}`
  if (group.scanEntry?.path) return `scan:${group.scanEntry.path}`
  if (members[0]?.path) return `orphan:${members[0].path}`
  return group.key
}

function truncateUuid(uuid: string): string {
  if (uuid.length <= 20) return uuid
  return `${uuid.slice(0, 18)}…`
}

function computeStoppedState(input: {
  members: StoppedMdArrayMember[]
  expectedDevices: number
  path?: string
  activePaths: Set<string>
  warnings: string[]
}): StoppedMdArray['stoppedState'] {
  if (input.warnings.some(w => w.includes('fusionnés'))) {
    return 'ambiguous'
  }
  if (input.path && input.activePaths.has(input.path)) {
    return 'stopped'
  }
  const presentCount = input.members.filter(m => m.present).length
  if (presentCount === 0) return 'stopped'
  if (input.expectedDevices > 0 && presentCount < input.expectedDevices) {
    return 'incomplete'
  }
  if (presentCount >= input.expectedDevices && input.expectedDevices > 0) {
    return 'assemblable'
  }
  return 'stopped'
}

function normalizeContainerName(name?: string): string {
  if (!name) return ''
  return name.trim().toLowerCase()
}

function inferMdNameFromContainer(containerName?: string): string | undefined {
  if (!containerName) return undefined
  const short = containerName.includes(':') ? containerName.split(':').pop() : containerName
  if (short && MD_NAME_RE.test(short)) return short
  return undefined
}

function parseRaidLevel(level?: string): { level: MdRaidLevel; known: boolean } {
  const normalized = level?.replace(/^raid/i, '').trim()
  if (normalized === '0' || normalized === '1' || normalized === '4'
    || normalized === '5' || normalized === '6' || normalized === '10') {
    return { level: normalized, known: true }
  }
  if (normalized === 'linear') return { level: 'linear', known: true }
  return { level: 'unknown', known: false }
}
