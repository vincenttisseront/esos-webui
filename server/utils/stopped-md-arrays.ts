/**
 * Détection des tableaux MD arrêtés / assemblables à partir des superblocks et du scan mdadm.
 */
import type {
  MdArray, MdExamineInfo, RaidBlockDevice, StoppedMdArray, StoppedMdArrayMember, StoppedMdMemberStatus,
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
    .sort((a, b) => a.name.localeCompare(b.name))
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
  const path = scanEntry?.path
  const name = scanEntry?.name
    ?? inferMdNameFromContainer(group.containerName)
    ?? path?.replace(/^\/dev\//, '')
    ?? 'unknown'

  if (activePaths.has(path ?? '') || name === 'unknown') {
    if (!group.members.length) return null
  }

  const raidLevel = normalizeRaidLevel(
    group.members.find(m => m.mdExamine?.raidLevel)?.mdExamine?.raidLevel,
  )
  const examineRaidDeviceCounts = group.members
    .map(m => m.mdExamine?.raidDevices)
    .filter((count): count is number => typeof count === 'number' && count > 0)
  const expectedDevices = examineRaidDeviceCounts.length > 0
    ? Math.max(...examineRaidDeviceCounts)
    : group.members.length

  const detectedOn = group.detectedOn.size === 2
    ? 'both'
    : group.detectedOn.has('scan')
      ? 'scan'
      : 'examine'

  const isOrphanArray = detectedOn === 'examine' && !scanEntry && !isValidMdArrayName(name)

  let members: StoppedMdArrayMember[] = group.members.map(member => ({
    path: member.path,
    mdExamine: member.mdExamine,
    present: true,
    memberStatus: 'md_superblock_detected' as StoppedMdMemberStatus,
  }))

  const stoppedState = computeStoppedState({
    members,
    expectedDevices,
    path,
    activePaths,
    warnings: group.warnings,
  })

  members = members.map(member => ({
    ...member,
    memberStatus: computeMemberStatus({
      present: member.present,
      mdExamine: member.mdExamine,
      hasMdSuperblock: group.members.find(m => m.path === member.path)?.hasMdSuperblock ?? false,
      isOrphanArray,
      stoppedState,
    }),
  }))

  const presentCount = members.filter(m => m.present).length
  const missingCount = Math.max(0, expectedDevices - presentCount)
  for (let i = 0; i < missingCount; i++) {
    members.push({
      path: '—',
      present: false,
      memberStatus: 'member_missing',
    })
  }

  return {
    name,
    path,
    uuid: group.uuid ?? scanEntry?.uuid,
    raidLevel,
    raidDevices: Math.max(expectedDevices, members.length, 1),
    metadataVersion: scanEntry?.metadataVersion,
    members,
    stoppedState,
    scanLine: scanEntry?.scanLine,
    warnings: [...new Set(group.warnings)],
    detectedOn,
  }
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
  if (short && /^md\d+$/i.test(short)) return short
  return undefined
}

export function isValidMdArrayName(name: string): boolean {
  return /^md[a-z0-9_-]{0,15}$/.test(name)
}

function computeMemberStatus(input: {
  present: boolean
  mdExamine?: MdExamineInfo
  hasMdSuperblock: boolean
  isOrphanArray: boolean
  stoppedState: StoppedMdArray['stoppedState']
}): StoppedMdMemberStatus {
  if (!input.present) return 'member_missing'
  if (input.isOrphanArray) return 'orphan_metadata'
  if (input.stoppedState === 'incomplete') return 'incomplete'
  if (input.mdExamine || input.hasMdSuperblock) return 'md_superblock_detected'
  return 'member_available'
}

function normalizeRaidLevel(level?: string): MdRaidLevel {
  const normalized = level?.replace(/^raid/i, '').trim()
  if (normalized === '0' || normalized === '1' || normalized === '4'
    || normalized === '5' || normalized === '6' || normalized === '10') {
    return normalized
  }
  if (normalized === 'linear') return 'linear'
  return 'unknown'
}
