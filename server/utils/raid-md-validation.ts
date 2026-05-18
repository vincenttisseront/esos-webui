import { createError } from 'h3'
import type {
  CreateMdArrayRequest,
  MdArray,
  MdCandidateCheck,
  RaidBlockDevice,
} from './raid-types'

export const MD_RAID_LEVELS = ['0', '1', '5', '6', '10'] as const
export const MD_CHUNK_KB_ALLOWLIST = [16, 32, 64, 128, 256, 512, 1024] as const
export const MD_CREATE_EMPTY_MEMBERS_MESSAGE = 'Commande MD invalide : aucune partition membre transmise.'

const MIN_DEVICES: Record<CreateMdArrayRequest['level'], number> = {
  '0': 2,
  '1': 2,
  '5': 3,
  '6': 4,
  '10': 4,
}

export interface MdCreateValidationResult {
  blockers: string[]
  warnings: string[]
  impactedDevices: string[]
  detectedUsage: Record<string, string[]>
  candidateChecks: MdCandidateCheck[]
  commandPreview?: string
}

export interface NormalizedMdCreateRequest extends CreateMdArrayRequest {
  name: string
  level: CreateMdArrayRequest['level']
  devices: string[]
  chunkKb: number
  confirmation: string
}

export function validateMdCreateRequest(
  req: Partial<CreateMdArrayRequest> & { name?: string; level?: string; devices?: string[]; chunkKb?: number },
  blockDevices: RaidBlockDevice[] = [],
  mdArrays: MdArray[] = [],
): MdCreateValidationResult {
  const blockers: string[] = []
  const warnings: string[] = []
  const impactedDevices: string[] = []
  const detectedUsage: Record<string, string[]> = {}
  const candidateChecks: MdCandidateCheck[] = []

  const name = String(req.name ?? '')
  const level = String(req.level ?? '') as CreateMdArrayRequest['level']
  const devices = Array.isArray(req.devices) ? req.devices.map(d => String(d)) : []
  const chunkKb = Number(req.chunkKb)
  const requestedRaidDevices = (req as Record<string, unknown>).raidDevices

  if (!isNumericMdArrayName(name)) {
    blockers.push('Le nom du tableau doit être numérique, par exemple md0 ou md1')
  }

  if (!MD_RAID_LEVELS.includes(level as any)) {
    blockers.push(`Niveau RAID invalide : ${level || '(vide)'}`)
  }

  if (!Array.isArray(req.devices)) {
    blockers.push('devices doit être une liste de partitions membres')
  }

  if (!MD_CHUNK_KB_ALLOWLIST.includes(chunkKb as any)) {
    blockers.push(`Taille de chunk invalide : ${Number.isFinite(chunkKb) ? chunkKb : '(vide)'} KB`)
  }

  if (requestedRaidDevices !== undefined && Number(requestedRaidDevices) !== devices.length) {
    blockers.push(`raidDevices (${requestedRaidDevices}) ne correspond pas au nombre de membres (${devices.length})`)
  }

  if (req.createPartitions) {
    blockers.push('La création automatique de partitions est hors périmètre pour ce flux')
  }
  if (req.assumePartitionsReady) {
    blockers.push('--assume-clean / assumePartitionsReady est hors périmètre pour ce flux')
  }

  const arrayPath = name ? `/dev/${name}` : ''
  if (arrayPath) {
    if (mdArrays.some(a => a.name === name || a.path === arrayPath)) {
      blockers.push(`${arrayPath} existe déjà comme tableau MD`)
    }
    if (blockDevices.some(d => d.path === arrayPath)) {
      blockers.push(`${arrayPath} existe déjà comme block device`)
    }
  }

  const uniqueDevices = new Set<string>()
  for (const dev of devices) {
    impactedDevices.push(dev)
    if (!isSafeDevicePath(dev)) {
      blockers.push(`Chemin device invalide : ${dev}`)
      continue
    }
    if (uniqueDevices.has(dev)) {
      blockers.push(`${dev} est sélectionné plusieurs fois`)
      continue
    }
    uniqueDevices.add(dev)

    const info = blockDevices.find(b => b.path === dev || `/dev/${b.name}` === dev)
    const reasons = info?.mdEligibilityReasons?.length
      ? [...info.mdEligibilityReasons]
      : info
        ? deriveMdEligibilityReasons(info)
        : ['Device introuvable dans le scan actuel']

    if (info?.usedBy?.length) detectedUsage[dev] = [...info.usedBy]
    candidateChecks.push({
      path: dev,
      eligible: reasons.length === 0,
      reasons,
      partitionType: info?.partitionType,
      partitionTypeName: info?.partitionTypeName,
      hasMdSuperblock: info?.hasMdSuperblock,
      signatures: info?.wipefsSignatures,
    })

    for (const reason of reasons) blockers.push(`${dev} : ${reason}`)
  }

  if (devices.length === 0) {
    blockers.push(MD_CREATE_EMPTY_MEMBERS_MESSAGE)
  }

  if (MD_RAID_LEVELS.includes(level as any)) {
    const min = MIN_DEVICES[level]
    if (devices.length < min) blockers.push(`RAID${level} requiert au minimum ${min} partitions`)
    if (level === '10' && devices.length % 2 !== 0) {
      blockers.push('RAID10 requiert un nombre pair de partitions')
    }
  }

  const commandPreview = blockers.length === 0
    ? buildMdCreateCommand({
        name,
        level,
        devices,
        chunkKb,
        confirmation: '',
      })
    : undefined

  if (candidateChecks.some(c => c.hasMdSuperblock)) {
    warnings.push('Un superblock MD existant nécessite une intervention manuelle hors WebUI; aucun zero-superblock automatique ne sera exécuté')
  }

  return { blockers: [...new Set(blockers)], warnings, impactedDevices, detectedUsage, candidateChecks, commandPreview }
}

export function assertValidMdCreateRequest(
  req: CreateMdArrayRequest,
  blockDevices: RaidBlockDevice[],
  mdArrays: MdArray[],
): MdCreateValidationResult {
  const result = validateMdCreateRequest(req, blockDevices, mdArrays)
  if (result.blockers.length > 0) {
    throw createError({ statusCode: 400, statusMessage: result.blockers.join('; ') })
  }
  return result
}

export function normalizeAndAssertMdCreateRequest(
  req: Partial<CreateMdArrayRequest> & { raidDevices?: unknown },
  blockDevices: RaidBlockDevice[],
  mdArrays: MdArray[],
): NormalizedMdCreateRequest {
  const result = validateMdCreateRequest(req, blockDevices, mdArrays)
  if (result.blockers.length > 0) {
    throw createError({ statusCode: 400, statusMessage: result.blockers.join('; ') })
  }
  return normalizeMdCreatePayload(req)
}

export function normalizeMdCreatePayload(
  req: Partial<CreateMdArrayRequest> & { raidDevices?: unknown },
): NormalizedMdCreateRequest {
  const name = sanitizeMdArrayName(String(req.name ?? ''))
  const level = sanitizeRaidLevel(String(req.level ?? ''))
  const devices = sanitizeMdMemberDevices(req.devices)
  assertMdMemberCount(level, devices.length)
  const requestedRaidDevices = req.raidDevices
  if (requestedRaidDevices !== undefined && Number(requestedRaidDevices) !== devices.length) {
    throw createError({ statusCode: 400, statusMessage: `raidDevices (${requestedRaidDevices}) ne correspond pas au nombre de membres (${devices.length})` })
  }
  return {
    ...(req as CreateMdArrayRequest),
    name,
    level,
    devices,
    chunkKb: sanitizeChunkKb(Number(req.chunkKb)),
    confirmation: String(req.confirmation ?? ''),
  }
}

export function buildMdCreateCommand(req: Pick<CreateMdArrayRequest, 'name' | 'level' | 'devices' | 'chunkKb'>): string {
  const name = sanitizeMdArrayName(req.name)
  const level = sanitizeRaidLevel(req.level)
  const devices = sanitizeMdMemberDevices(req.devices)
  const chunkKb = sanitizeChunkKb(req.chunkKb)
  assertMdMemberCount(level, devices.length)
  const command = `mdadm --create /dev/${name} --chunk=${chunkKb} --level=${level} --raid-devices=${devices.length} --run ${devices.join(' ')}`
  assertRenderedMdCreateCommand(command, devices.length)
  return command
}

export function expectedMdCreateConfirmation(name: string): string {
  return `CREATE ${sanitizeMdArrayName(name)}`
}

export function sanitizeMdArrayName(name: string): string {
  if (!isNumericMdArrayName(name)) {
    throw createError({ statusCode: 400, statusMessage: `Nom d'array invalide : ${name}` })
  }
  return name
}

export function sanitizeDevicePath(dev: string): string {
  if (!isSafeDevicePath(dev)) {
    throw createError({ statusCode: 400, statusMessage: `Chemin device invalide : ${dev}` })
  }
  return dev
}

function sanitizeChunkKb(chunkKb: number): number {
  if (!MD_CHUNK_KB_ALLOWLIST.includes(Number(chunkKb) as any)) {
    throw createError({ statusCode: 400, statusMessage: `Taille de chunk invalide : ${chunkKb}` })
  }
  return Number(chunkKb)
}

function sanitizeRaidLevel(level: string): CreateMdArrayRequest['level'] {
  if (!MD_RAID_LEVELS.includes(level as any)) {
    throw createError({ statusCode: 400, statusMessage: `Niveau RAID invalide : ${level}` })
  }
  return level as CreateMdArrayRequest['level']
}

function sanitizeMdMemberDevices(rawDevices: unknown): string[] {
  if (!Array.isArray(rawDevices)) {
    throw createError({ statusCode: 400, statusMessage: 'devices doit être une liste de partitions membres' })
  }
  if (rawDevices.length === 0) {
    throw createError({ statusCode: 400, statusMessage: MD_CREATE_EMPTY_MEMBERS_MESSAGE })
  }
  const devices = rawDevices.map(device => sanitizeDevicePath(String(device)))
  const unique = new Set(devices)
  if (unique.size !== devices.length) {
    throw createError({ statusCode: 400, statusMessage: 'Chaque partition membre doit être sélectionnée une seule fois' })
  }
  return devices
}

function assertMdMemberCount(level: CreateMdArrayRequest['level'], count: number): void {
  const min = MIN_DEVICES[level]
  if (count < min) {
    throw createError({ statusCode: 400, statusMessage: `RAID${level} requiert au minimum ${min} partitions` })
  }
  if (level === '10' && count % 2 !== 0) {
    throw createError({ statusCode: 400, statusMessage: 'RAID10 requiert un nombre pair de partitions' })
  }
}

function assertRenderedMdCreateCommand(command: string, expectedMembers: number): void {
  const raidDevices = command.match(/--raid-devices=(\d+)/)?.[1]
  if (!raidDevices || Number(raidDevices) !== expectedMembers || expectedMembers <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Commande mdadm invalide : nombre de membres incohérent' })
  }
  const memberCount = command.match(/\/dev\/[a-z0-9_./-]+/gi)?.filter(path => !path.startsWith('/dev/md')).length ?? 0
  if (memberCount !== expectedMembers) {
    throw createError({ statusCode: 400, statusMessage: 'Commande mdadm invalide : membres manquants' })
  }
}

function isNumericMdArrayName(name: string): boolean {
  return /^md\d+$/.test(name)
}

function isSafeDevicePath(dev: string): boolean {
  return /^\/dev\/[a-z0-9_./-]{1,64}$/i.test(dev)
}

function deriveMdEligibilityReasons(info: RaidBlockDevice): string[] {
  const reasons: string[] = []
  if (info.type !== 'part') reasons.push('Seules les partitions existantes sont éligibles')
  if (!info.partitionTypeCode && !info.partitionTypeName) reasons.push('Type de partition Linux RAID Autodetect requis')
  if (info.usedBy.includes('mounted')) reasons.push(`Monté${info.mountpoint ? ` sur ${info.mountpoint}` : ''}`)
  if (info.usedBy.includes('filesystem')) reasons.push('Système de fichiers détecté')
  if (info.usedBy.includes('lvm')) reasons.push('PV LVM détecté')
  if (info.usedBy.includes('scst')) reasons.push('Utilisé par SCST')
  if (info.usedBy.includes('md')) reasons.push(info.hasMdSuperblock ? 'Superblock MD existant détecté' : 'Déjà membre MD')
  if (info.usedBy.includes('unknown_signature')) reasons.push('Signature existante non autorisée')
  return [...new Set(reasons)]
}
