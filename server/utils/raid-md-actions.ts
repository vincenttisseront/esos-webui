/**
 * Actions Software RAID MD via SSH (SDD v3.12 §8.4, §9.3, §10).
 */
import { createError } from 'h3'
import type { SSHSessionManager } from './ssh-session-manager'
import type { AssembleMdArrayRequest, CreateMdArrayRequest, ZeroMdSuperblockPartitionResult } from './raid-types'
import { parseMdadmExamineOutput } from './parsers/mdadm-examine.parser'
import {
  buildZeroCleanupFailureError,
  collectPartitionMetadataDiagnostics,
  expectedMdAdvancedCleanupConfirmation,
  expectedMdWipeSignaturesConfirmation,
  MD_ADVANCED_CLEANUP_CONFIRMATION,
  MD_WIPE_SIGNATURES_CONFIRMATION,
  zeroSuperblockWithDiagnostics,
  wipeSignaturesWithDiagnostics,
} from './raid-md-metadata-diagnostics'
import { buildMdCreateCommand, MD_CREATE_EMPTY_MEMBERS_MESSAGE, normalizeMdCreatePayload, sanitizeMdArrayName } from './raid-md-validation'

const WRITE_ENABLED = process.env.RAID_SOFTWARE_WRITE_ENABLED !== 'false'
  && process.env.RAID_WRITE_ACTIONS_ENABLED !== 'false'

export const MDADM_INTERACTIVE_CONFIRM_PROMPT = 'Continue creating array?'
export const MDADM_INTERACTIVE_CONFIRM_MESSAGE = 'mdadm is waiting for interactive confirmation; non-interactive mode is required.'

export function isMdadmAwaitingInteractiveConfirmation(stdout?: string, stderr?: string): boolean {
  const combined = [stdout, stderr].filter(Boolean).join('\n')
  return combined.includes(MDADM_INTERACTIVE_CONFIRM_PROMPT)
}

export function isMdadmCreateCommandFailure(stdout: string): boolean {
  const exitMatch = stdout.match(/EXIT_CODE=(\d+)/)
  if (exitMatch && Number(exitMatch[1]) !== 0) return true
  if (/^mdadm:\s+error\b/im.test(stdout)) return true
  if (/^mdadm:\s+failed\b/im.test(stdout)) return true
  return false
}

export function resolveMdCreateExecErrorMessage(
  err: any,
  finalCommand: string,
  stdout?: string,
  stderr?: string,
): string {
  if (isMdadmAwaitingInteractiveConfirmation(stdout, stderr)) {
    return MDADM_INTERACTIVE_CONFIRM_MESSAGE
  }
  const raw = err?.statusMessage ?? err?.message ?? 'Erreur SSH création MD array'
  const timeoutMatch = raw.match(/SSH exec timeout \((\d+)ms\)/)
  if (timeoutMatch) {
    return `SSH exec timeout (${timeoutMatch[1]}ms): ${finalCommand}`
  }
  return raw
}

export interface MdCreateExecutionTraceContext {
  endpoint?: string
  sanId?: string
  nodeLabel?: string
}

function assertWriteEnabled(): void {
  if (!WRITE_ENABLED) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Les actions d\'écriture RAID sont désactivées (RAID_SOFTWARE_WRITE_ENABLED=false)',
    })
  }
}

// ─── Création array MD ────────────────────────────────────────────────────────

export async function createMdArray(
  manager: SSHSessionManager,
  req: CreateMdArrayRequest,
): Promise<{ stdout: string; command: string; persisted: boolean }> {
  return createMdArrayFromPlan(manager, req)
}

export async function createMdArrayFromPlan(
  manager: SSHSessionManager,
  req: CreateMdArrayRequest,
  planCommand?: string,
  traceContext: MdCreateExecutionTraceContext = {},
): Promise<{ stdout: string; command: string; persisted: boolean }> {
  assertWriteEnabled()

  const normalizedReq = normalizeMdCreatePayload(req)
  const arrayName = sanitizeMdArrayName(normalizedReq.name)
  const command = buildMdCreateCommand(normalizedReq)
  assertExecutableMdCreateCommand(command, normalizedReq.devices)
  traceMdCreate('rebuilt-command', traceContext, normalizedReq, command, planCommand)
  if (planCommand !== undefined && planCommand.trim() !== command) {
    traceMdCreate('plan-command-mismatch', traceContext, normalizedReq, command, planCommand)
    throw createError({
      statusCode: 400,
      statusMessage: `Commande MD planifiée différente de la commande d'exécution : ${planCommand.trim()} != ${command}`,
    })
  }
  if (planCommand !== undefined) {
    assertExecutableMdCreateCommand(planCommand.trim(), normalizedReq.devices)
  }

  if (/--raid-devices=(?:\s|$)/.test(command) || !/--raid-devices=\d+/.test(command)) {
    throw createError({ statusCode: 400, statusMessage: MD_CREATE_EMPTY_MEMBERS_MESSAGE })
  }

  const finalCommand = command
  const sshCommand = `${finalCommand} 2>&1; echo EXIT_CODE=$?`
  if (planCommand !== undefined && finalCommand !== planCommand.trim()) {
    traceMdCreate('final-command-plan-mismatch', traceContext, normalizedReq, finalCommand, planCommand)
    throw createError({
      statusCode: 400,
      statusMessage: `Commande MD planifiée différente de la commande finale : ${planCommand.trim()} != ${finalCommand}`,
    })
  }

  traceMdCreate('ssh-exec', traceContext, normalizedReq, finalCommand, planCommand)

  let stdout = ''
  try {
    const execResult = await manager.exec(sshCommand, 120_000)
    stdout = execResult.stdout
  } catch (err: any) {
    const errorStdout = extractErrorText(err, 'stdout')
    const errorStderr = extractErrorText(err, 'stderr')
    const errorMessage = resolveMdCreateExecErrorMessage(err, finalCommand, errorStdout, errorStderr)
    traceMdCreateError('ssh-exec-error', traceContext, normalizedReq, finalCommand, planCommand, errorMessage, errorStdout, errorStderr)
    throw createError({
      statusCode: err?.statusCode ?? 500,
      statusMessage: errorMessage,
      data: {
        command: finalCommand,
        stdout: errorStdout,
        stderr: errorStderr,
      },
    })
  }

  if (isMdadmAwaitingInteractiveConfirmation(stdout)) {
    const errorMessage = MDADM_INTERACTIVE_CONFIRM_MESSAGE
    traceMdCreateError('mdadm-interactive-prompt', traceContext, normalizedReq, finalCommand, planCommand, errorMessage, stdout, undefined)
    throw createError({
      statusCode: 500,
      statusMessage: errorMessage,
      data: {
        command: finalCommand,
        stdout,
      },
    })
  }

  if (isMdadmCreateCommandFailure(stdout)) {
    const errorMessage = `Échec mdadm --create : ${stdout.slice(-500)}`
    traceMdCreateError('mdadm-create-failed', traceContext, normalizedReq, finalCommand, planCommand, errorMessage, stdout, undefined)
    throw createError({
      statusCode: 500,
      statusMessage: errorMessage,
      data: {
        command: finalCommand,
        stdout,
      },
    })
  }

  // Persistance mdadm.conf
  let persisted = false
  try {
    const { stdout: persistOut } = await manager.exec(
      [
        // Supprimer les lignes existantes pour ce même array (même UUID ou même nom)
        `grep -v "${arrayName}" /etc/mdadm.conf 2>/dev/null > /tmp/mdadm.conf.tmp || touch /tmp/mdadm.conf.tmp`,
        `mdadm --detail --scan >> /tmp/mdadm.conf.tmp`,
        `sort -u -k2,2 /tmp/mdadm.conf.tmp > /etc/mdadm.conf`,
        'conf_sync.sh 2>/dev/null || true',
        'echo PERSIST_OK',
      ].join('; '),
      30_000,
    )
    persisted = persistOut.includes('PERSIST_OK')
  } catch { /* non bloquant */ }

  return { stdout: stdout.slice(0, 2000), command: finalCommand, persisted }
}

function assertExecutableMdCreateCommand(command: string, members: string[]): void {
  if (members.length === 0) {
    throw createError({ statusCode: 400, statusMessage: MD_CREATE_EMPTY_MEMBERS_MESSAGE })
  }
  const raidDevices = command.match(/--raid-devices=(\d+)/)?.[1]
  if (!raidDevices || Number(raidDevices) !== members.length) {
    throw createError({ statusCode: 400, statusMessage: 'Commande MD invalide : nombre de membres incohérent.' })
  }
  for (const member of members) {
    if (!command.split(/\s+/).includes(member)) {
      throw createError({ statusCode: 400, statusMessage: `Commande MD invalide : membre manquant ${member}` })
    }
  }
}

function traceMdCreate(
  event: string,
  context: MdCreateExecutionTraceContext,
  req: CreateMdArrayRequest,
  command: string,
  planCommand?: string,
): void {
  console.info('[raid-md:create]', {
    event,
    endpoint: context.endpoint ?? 'unknown',
    sanId: context.sanId,
    nodeLabel: context.nodeLabel,
    arrayName: req.name,
    level: req.level,
    chunkKb: req.chunkKb,
    membersLength: req.devices.length,
    members: req.devices,
    plannedCommand: planCommand,
    rebuiltCommand: command,
    finalCommand: command,
  })
}

function traceMdCreateError(
  event: string,
  context: MdCreateExecutionTraceContext,
  req: CreateMdArrayRequest,
  command: string,
  planCommand: string | undefined,
  errorMessage: string,
  stdout?: string,
  stderr?: string,
): void {
  console.info('[raid-md:create]', {
    event,
    endpoint: context.endpoint ?? 'unknown',
    sanId: context.sanId,
    nodeLabel: context.nodeLabel,
    arrayName: req.name,
    level: req.level,
    chunkKb: req.chunkKb,
    membersLength: req.devices.length,
    members: req.devices,
    plannedCommand: planCommand,
    finalCommand: command,
    errorMessage,
    stdout,
    stderr,
  })
}

function extractErrorText(err: any, key: 'stdout' | 'stderr'): string | undefined {
  const value = err?.data?.[key] ?? err?.[key]
  return typeof value === 'string' ? value : undefined
}

// ─── Assemble stopped array ───────────────────────────────────────────────────

export function expectedMdAssembleConfirmation(name: string): string {
  return `ASSEMBLE ${sanitizeArrayName(name)}`
}

export function buildMdAssembleCommand(name: string, members: string[] = []): string {
  const arrayPath = `/dev/${sanitizeArrayName(name)}`
  const memberPaths = members.map(sanitizeDevicePath)
  if (memberPaths.length > 0) {
    return `mdadm --assemble ${arrayPath} ${memberPaths.join(' ')}`
  }
  return `mdadm --assemble ${arrayPath}`
}

export async function assembleMdArray(
  manager: SSHSessionManager,
  req: AssembleMdArrayRequest,
): Promise<{ stdout: string; command: string }> {
  assertWriteEnabled()
  const arrayName = sanitizeArrayName(req.targetName ?? req.name)
  const members = (req.members ?? []).map(sanitizeDevicePath)
  const command = buildMdAssembleCommand(arrayName, members)
  const { stdout } = await manager.exec(`${command} 2>&1; echo EXIT_CODE=$?`, 120_000)
  if (isMdadmAwaitingInteractiveConfirmation(stdout)) {
    throw createError({
      statusCode: 500,
      statusMessage: MDADM_INTERACTIVE_CONFIRM_MESSAGE,
      data: { command, stdout },
    })
  }
  if (isMdadmCreateCommandFailure(stdout)) {
    throw createError({
      statusCode: 500,
      statusMessage: `Échec mdadm --assemble : ${stdout.slice(-500)}`,
      data: { command, stdout },
    })
  }
  return { stdout: stdout.slice(0, 2000), command }
}

// ─── Zero superblocks ─────────────────────────────────────────────────────────

export const MD_ZERO_METADATA_CONFIRMATION = 'ZERO RAID METADATA'

export function expectedMdZeroMetadataConfirmation(): string {
  return MD_ZERO_METADATA_CONFIRMATION
}

/** @deprecated Use expectedMdZeroMetadataConfirmation() — name is no longer required */
export function expectedMdZeroSuperblocksConfirmation(_name: string): string {
  return expectedMdZeroMetadataConfirmation()
}

export function validateZeroSuperblockMembers(
  members: string[],
  blockDevices: Array<{ path: string; hasMdSuperblock?: boolean; mdExamine?: unknown; usedBy: string[] }>,
  mdArrays: Array<{ path: string; name: string; members: Array<{ path?: string }> }>,
): string[] {
  const blockers: string[] = []
  if (members.length === 0) {
    blockers.push('Au moins une partition membre est requise')
    return blockers
  }

  const activeMemberPaths = new Set(
    mdArrays.flatMap(arr => arr.members.map(m => m.path).filter(Boolean) as string[]),
  )

  for (const memberPath of members) {
    const dev = blockDevices.find(d => d.path === memberPath)
    if (!dev) {
      blockers.push(`Partition introuvable : ${memberPath}`)
      continue
    }
    if (!dev.hasMdSuperblock && !dev.mdExamine) {
      blockers.push(`${memberPath} : aucun superblock MD détecté`)
    }
    if (dev.usedBy.includes('mounted')) blockers.push(`${memberPath} est monté`)
    if (dev.usedBy.includes('lvm')) blockers.push(`${memberPath} est utilisé par LVM`)
    if (dev.usedBy.includes('scst')) blockers.push(`${memberPath} est utilisé par SCST`)
    if (activeMemberPaths.has(memberPath)) {
      const owner = mdArrays.find(arr => arr.members.some(m => m.path === memberPath))
      blockers.push(`${memberPath} est membre actif de ${owner?.path ?? 'un tableau MD actif'}`)
    }
  }

  return blockers
}

export function validateWipeSignatureMembers(
  members: string[],
  blockDevices: Array<{ path: string; usedBy: string[] }>,
  mdArrays: Array<{ path: string; name: string; members: Array<{ path?: string }> }>,
): string[] {
  const blockers: string[] = []
  if (members.length === 0) {
    blockers.push('Au moins une partition membre est requise')
    return blockers
  }

  const activeMemberPaths = new Set(
    mdArrays.flatMap(arr => arr.members.map(m => m.path).filter(Boolean) as string[]),
  )

  for (const memberPath of members) {
    const dev = blockDevices.find(d => d.path === memberPath)
    if (!dev) {
      blockers.push(`Partition introuvable : ${memberPath}`)
      continue
    }
    if (dev.usedBy.includes('mounted')) blockers.push(`${memberPath} est monté`)
    if (dev.usedBy.includes('lvm')) blockers.push(`${memberPath} est utilisé par LVM`)
    if (dev.usedBy.includes('scst')) blockers.push(`${memberPath} est utilisé par SCST`)
    if (activeMemberPaths.has(memberPath)) {
      const owner = mdArrays.find(arr => arr.members.some(m => m.path === memberPath))
      blockers.push(`${memberPath} est membre actif de ${owner?.path ?? 'un tableau MD actif'}`)
    }
  }

  return blockers
}

export {
  expectedMdAdvancedCleanupConfirmation,
  expectedMdWipeSignaturesConfirmation,
  MD_ADVANCED_CLEANUP_CONFIRMATION,
  MD_WIPE_SIGNATURES_CONFIRMATION,
}

const ZERO_SUPERBLOCK_EXIT_MARKER = '__MD_ZERO_EXIT__'

function parseSshExitCode(stdout: string, marker = ZERO_SUPERBLOCK_EXIT_MARKER): number {
  const match = stdout.match(new RegExp(`${marker}=(\\d+)`))
  return match ? Number(match[1]) : 1
}

function stripExitMarker(stdout: string, marker = ZERO_SUPERBLOCK_EXIT_MARKER): string {
  return stdout.replace(new RegExp(`\\n?${marker}=\\d+\\s*$`), '').trim()
}

export async function verifyMdSuperblockRemoved(
  manager: SSHSessionManager,
  partition: string,
): Promise<{ verifiedRemoved: boolean | null; verificationStdout: string }> {
  const devPath = sanitizeDevicePath(partition)
  try {
    const { stdout } = await manager.exec(`mdadm --examine ${devPath} 2>&1`, 30_000)
    const trimmed = stdout.trim()
    if (/No md superblock detected/i.test(trimmed)) {
      return { verifiedRemoved: true, verificationStdout: trimmed.slice(0, 1000) }
    }
    const parsed = parseMdadmExamineOutput(trimmed)
    return { verifiedRemoved: !parsed, verificationStdout: trimmed.slice(0, 1000) }
  } catch (err: any) {
    const msg = err?.statusMessage ?? err?.message ?? String(err)
    return { verifiedRemoved: null, verificationStdout: msg.slice(0, 500) }
  }
}

export async function zeroMdSuperblockOnPartition(
  manager: SSHSessionManager,
  partition: string,
): Promise<ZeroMdSuperblockPartitionResult> {
  return zeroSuperblockWithDiagnostics(manager, partition)
}

export async function zeroMdSuperblocks(
  manager: SSHSessionManager,
  members: string[],
): Promise<import('./raid-types').ZeroMdSuperblocksResponse> {
  assertWriteEnabled()
  if (members.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Au moins une partition membre est requise' })
  }

  const results: ZeroMdSuperblockPartitionResult[] = []
  const warnings: string[] = []

  for (const member of members) {
    results.push(await zeroMdSuperblockOnPartition(manager, member))
  }

  for (const r of results) {
    if (!r.success) {
      warnings.push(`${r.partition} : mdadm --zero-superblock a échoué (code ${r.exitCode})`)
    } else if (r.verifiedRemoved === false) {
      warnings.push(`${r.partition} : superblock MD encore détecté après nettoyage`)
    } else if (r.verifiedRemoved === null) {
      warnings.push(`${r.partition} : vérification mdadm --examine non concluante`)
    }
  }

  const commands = results.map(r => r.command)
  const stdout = results.map(r => r.stdout).filter(Boolean).join('\n---\n').slice(0, 4000)
  const failed = results.some(r => !r.success || r.verifiedRemoved === false)
  const ok = !failed
  const advancedCleanupAvailable = results.some(
    r => r.diagnostics?.recommendedAction === 'advanced_wipe_signatures',
  )

  if (failed) {
    throw buildZeroCleanupFailureError(results, warnings)
  }

  return { ok, results, warnings, stdout, commands, advancedCleanupAvailable }
}

export async function wipeMdSignatures(
  manager: SSHSessionManager,
  members: string[],
  signatureTypesByMember?: Record<string, string[]>,
  detectionSourcesByMember?: import('./raid-types').WipeMdSignaturesRequest['detectionSourcesByMember'],
): Promise<import('./raid-types').WipeMdSignaturesResponse> {
  assertWriteEnabled()
  console.info('[raid-md:cleanup]', { mode: 'advanced', members })
  if (members.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Au moins une partition membre est requise' })
  }

  const results: ZeroMdSuperblockPartitionResult[] = []
  const warnings: string[] = []

  for (const member of members) {
    const devPath = sanitizeDevicePath(member)
    const presetTypes = signatureTypesByMember?.[devPath] ?? signatureTypesByMember?.[member]
    let remainingTypes = presetTypes
    if (!remainingTypes?.length) {
      const baseline = await collectPartitionMetadataDiagnostics(manager, devPath)
      remainingTypes = baseline.remainingSignatureTypes
      if (baseline.verifiedRemoved) {
        warnings.push(`${devPath} : aucune signature RAID détectée avant nettoyage`)
      }
    }
    if (!remainingTypes.length) {
      warnings.push(`${devPath} : aucune signature à effacer`)
      continue
    }
    const detectionSources = detectionSourcesByMember?.[devPath]
      ?? detectionSourcesByMember?.[member]
    results.push(await wipeSignaturesWithDiagnostics(manager, devPath, remainingTypes, detectionSources))
  }

  if (results.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Aucune signature RAID à effacer sur les partitions sélectionnées',
    })
  }

  for (const r of results) {
    if (!r.success) {
      warnings.push(`${r.partition} : wipefs a échoué (code ${r.exitCode})`)
    } else if (r.verifiedRemoved === false) {
      warnings.push(`${r.partition} : métadonnées RAID encore détectées après nettoyage des signatures`)
    }
  }

  const commands = results.map(r => r.command)
  const stdout = results.map(r => r.stdout).filter(Boolean).join('\n---\n').slice(0, 4000)
  const failed = results.some(r => !r.success || r.verifiedRemoved === false)

  if (failed) {
    throw buildZeroCleanupFailureError(results, warnings)
  }

  return { ok: true, results, warnings, stdout, commands }
}

// ─── Stop array ───────────────────────────────────────────────────────────────

export async function stopMdArray(
  manager: SSHSessionManager,
  arrayName: string,
): Promise<{ stdout: string }> {
  assertWriteEnabled()
  const path = `/dev/${sanitizeArrayName(arrayName)}`
  const { stdout } = await manager.exec(
    `mdadm --stop ${path} 2>&1; echo EXIT_CODE=$?`,
    60_000,
  )
  if (stdout.match(/EXIT_CODE=[1-9]/)) {
    throw createError({ statusCode: 500, statusMessage: `Échec mdadm --stop : ${stdout.slice(-300)}` })
  }
  return { stdout: stdout.slice(0, 1000) }
}

// ─── Add device ───────────────────────────────────────────────────────────────

export async function addMdDevice(
  manager: SSHSessionManager,
  arrayName: string,
  device: string,
): Promise<{ stdout: string }> {
  assertWriteEnabled()
  const path = `/dev/${sanitizeArrayName(arrayName)}`
  const devPath = sanitizeDevicePath(device)
  const { stdout } = await manager.exec(
    `mdadm ${path} --add ${devPath} 2>&1; echo EXIT_CODE=$?`,
    30_000,
  )
  if (stdout.match(/EXIT_CODE=[1-9]/)) {
    throw createError({ statusCode: 500, statusMessage: `Échec mdadm --add : ${stdout.slice(-300)}` })
  }
  return { stdout: stdout.slice(0, 1000) }
}

// ─── Set faulty ───────────────────────────────────────────────────────────────

export async function setMdDeviceFaulty(
  manager: SSHSessionManager,
  arrayName: string,
  device: string,
): Promise<{ stdout: string }> {
  assertWriteEnabled()
  const path = `/dev/${sanitizeArrayName(arrayName)}`
  const devPath = sanitizeDevicePath(device)
  const { stdout } = await manager.exec(
    `mdadm ${path} --fail ${devPath} 2>&1; echo EXIT_CODE=$?`,
    30_000,
  )
  if (stdout.match(/EXIT_CODE=[1-9]/)) {
    throw createError({ statusCode: 500, statusMessage: `Échec mdadm --fail : ${stdout.slice(-300)}` })
  }
  return { stdout: stdout.slice(0, 1000) }
}

// ─── Remove device ────────────────────────────────────────────────────────────

export async function removeMdDevice(
  manager: SSHSessionManager,
  arrayName: string,
  device: string,
): Promise<{ stdout: string }> {
  assertWriteEnabled()
  const path = `/dev/${sanitizeArrayName(arrayName)}`
  const devPath = sanitizeDevicePath(device)
  const { stdout } = await manager.exec(
    `mdadm ${path} --remove ${devPath} 2>&1; echo EXIT_CODE=$?`,
    30_000,
  )
  if (stdout.match(/EXIT_CODE=[1-9]/)) {
    throw createError({ statusCode: 500, statusMessage: `Échec mdadm --remove : ${stdout.slice(-300)}` })
  }
  return { stdout: stdout.slice(0, 1000) }
}

// ─── Validation / sanitisation ────────────────────────────────────────────────

function sanitizeArrayName(name: string): string {
  // Accepte md0, md_root, md127, etc.
  if (!/^md[a-z0-9_-]{0,15}$/.test(name)) {
    throw createError({ statusCode: 400, statusMessage: `Nom d'array invalide : ${name}` })
  }
  return name
}

function sanitizeDevicePath(dev: string): string {
  // Doit être un chemin /dev/... ou un device court sdX, nvmeX, etc.
  const path = dev.startsWith('/dev/') ? dev : `/dev/${dev}`
  if (!/^\/dev\/[a-z0-9_./-]{1,64}$/.test(path)) {
    throw createError({ statusCode: 400, statusMessage: `Chemin device invalide : ${dev}` })
  }
  return path
}
