/**
 * Multi-source MD metadata diagnostics and advanced wipefs fallback.
 */
import { createError } from 'h3'
import type { SSHSessionManager } from './ssh-session-manager'
import type {
  CommandProbeResult,
  PartitionMetadataDiagnostics,
  PartitionMetadataRecommendedAction,
  ZeroMdSuperblockPartitionResult,
} from './raid-types'
import { parseMdadmExamineOutput } from './parsers/mdadm-examine.parser'
import { parseBlkidTypes, parseWipefsProbeOutput } from './parsers/wipefs-output.parser'

export const MD_WIPE_SIGNATURES_CONFIRMATION = 'WIPE SIGNATURES'

const PROBE_EXIT_MARKER = '__PROBE_EXIT__'
const ZERO_EXIT_MARKER = '__MD_ZERO_EXIT__'

const RAID_SIGNATURE_PATTERNS = [
  /^linux_raid_member$/i,
  /^mdraid$/i,
  /^mdadm$/i,
  /^raid/i,
]

export function sanitizeMdDevicePath(dev: string): string {
  const path = dev.startsWith('/dev/') ? dev : `/dev/${dev}`
  if (!/^\/dev\/[a-z0-9_./-]{1,64}$/.test(path)) {
    throw createError({ statusCode: 400, statusMessage: `Chemin device invalide : ${dev}` })
  }
  return path
}

export function isRaidRelatedSignature(type: string): boolean {
  const normalized = type.trim().toLowerCase()
  if (normalized === 'mdadm_examine') return true
  return RAID_SIGNATURE_PATTERNS.some(re => re.test(normalized))
}

function parseProbeExit(stdout: string, marker = PROBE_EXIT_MARKER): { exitCode: number; body: string } {
  const match = stdout.match(new RegExp(`${marker}=(\\d+)\\s*$`))
  const exitCode = match ? Number(match[1]) : 1
  const body = stdout.replace(new RegExp(`\\n?${marker}=\\d+\\s*$`), '').trim()
  return { exitCode, body }
}

async function execProbe(
  manager: SSHSessionManager,
  command: string,
  timeoutMs = 30_000,
): Promise<CommandProbeResult> {
  const sshCommand = `${command} 2>&1; echo ${PROBE_EXIT_MARKER}=$?`
  try {
    const { stdout, stderr } = await manager.exec(sshCommand, timeoutMs)
    const { exitCode, body } = parseProbeExit(stdout ?? '')
    return {
      command,
      exitCode,
      stdout: body.slice(0, 2000),
      stderr: (stderr ?? '').slice(0, 500),
    }
  } catch (err: any) {
    const stdout = err?.data?.stdout ?? err?.stdout ?? ''
    const stderr = err?.data?.stderr ?? err?.stderr ?? err?.message ?? ''
    const { exitCode, body } = parseProbeExit(typeof stdout === 'string' ? stdout : String(stdout))
    return {
      command,
      exitCode: exitCode || 1,
      stdout: body.slice(0, 2000),
      stderr: String(stderr).slice(0, 500),
    }
  }
}

export async function probeMdadmExamine(
  manager: SSHSessionManager,
  partition: string,
): Promise<CommandProbeResult & { detected: boolean }> {
  const devPath = sanitizeMdDevicePath(partition)
  const command = `mdadm --examine ${devPath}`
  const probe = await execProbe(manager, command)
  const detected = (() => {
    if (/No md superblock detected/i.test(probe.stdout)) return false
    return !!parseMdadmExamineOutput(probe.stdout)
  })()
  return { ...probe, detected }
}

export async function probeWipefs(
  manager: SSHSessionManager,
  partition: string,
): Promise<CommandProbeResult & { signatures: string[] }> {
  const devPath = sanitizeMdDevicePath(partition)
  const command = `wipefs -n ${devPath}`
  const probe = await execProbe(manager, command)
  const signatures = parseWipefsProbeOutput(probe.stdout)
  return { ...probe, signatures }
}

export async function probeBlkid(
  manager: SSHSessionManager,
  partition: string,
): Promise<CommandProbeResult & { types: string[]; available: boolean }> {
  const devPath = sanitizeMdDevicePath(partition)
  const command = `blkid -p ${devPath} 2>/dev/null || blkid ${devPath} 2>/dev/null`
  const probe = await execProbe(manager, command)
  const unavailable = /not found|command not found/i.test(probe.stdout + probe.stderr)
  const types = unavailable ? [] : parseBlkidTypes(probe.stdout)
  return { ...probe, types, available: !unavailable }
}

export async function runPostCleanupSync(manager: SSHSessionManager, partition: string): Promise<void> {
  const devPath = sanitizeMdDevicePath(partition)
  const cmd = [
    `partprobe ${devPath} 2>/dev/null || true`,
    'partprobe 2>/dev/null || true',
    'udevadm settle 2>/dev/null || true',
  ].join('; ')
  try {
    await manager.exec(cmd, 30_000)
  } catch { /* non bloquant */ }
}

export function buildRemainingSignatureTypes(input: {
  examineDetected: boolean
  wipefsSignatures: string[]
  blkidTypes: string[]
}): string[] {
  const types = new Set<string>()
  if (input.examineDetected) types.add('mdadm_examine')
  for (const s of input.wipefsSignatures) types.add(s)
  for (const t of input.blkidTypes) types.add(t)
  return [...types].filter(t => isRaidRelatedSignature(t) || t === 'mdadm_examine')
}

export function computeRecommendedAction(input: {
  zeroSuccess: boolean
  verifiedRemoved: boolean
  remainingSignatureTypes: string[]
}): PartitionMetadataRecommendedAction {
  if (input.verifiedRemoved) return 'none'
  if (!input.zeroSuccess) return 'manual_investigation'
  const hasRaidSig = input.remainingSignatureTypes.some(isRaidRelatedSignature)
  if (hasRaidSig) return 'advanced_wipe_signatures'
  return 'manual_investigation'
}

export function buildDiagnosticsSummary(d: PartitionMetadataDiagnostics): string {
  const lines = [`Partition ${d.partition} : métadonnées MD encore détectées.`]
  if (d.detectionSources.mdadmExamine) {
    lines.push(`- mdadm --examine : superblock détecté`)
  }
  if (d.detectionSources.wipefs && d.wipefsProbe.signatures.length) {
    lines.push(`- wipefs -n : ${d.wipefsProbe.signatures.join(', ')}`)
  }
  if (d.detectionSources.blkid && d.blkidProbe.types.length) {
    lines.push(`- blkid : ${d.blkidProbe.types.join(', ')}`)
  }
  if (d.remainingSignatureTypes.length) {
    lines.push(`Signatures restantes : ${d.remainingSignatureTypes.join(', ')}`)
  }
  if (d.recommendedAction === 'advanced_wipe_signatures') {
    lines.push('Action recommandée : Nettoyer les signatures restantes (destructif).')
  }
  return lines.join('\n')
}

export async function collectPartitionMetadataDiagnostics(
  manager: SSHSessionManager,
  partition: string,
  zeroSuperblock?: CommandProbeResult & { success: boolean },
): Promise<PartitionMetadataDiagnostics> {
  const devPath = sanitizeMdDevicePath(partition)

  const mdadmExamine = await probeMdadmExamine(manager, devPath)
  const wipefsProbe = await probeWipefs(manager, devPath)
  const blkidProbe = await probeBlkid(manager, devPath)

  const detectionSources = {
    mdadmExamine: mdadmExamine.detected,
    wipefs: wipefsProbe.signatures.some(isRaidRelatedSignature),
    blkid: blkidProbe.types.some(isRaidRelatedSignature),
  }

  const remainingSignatureTypes = buildRemainingSignatureTypes({
    examineDetected: mdadmExamine.detected,
    wipefsSignatures: wipefsProbe.signatures,
    blkidTypes: blkidProbe.types,
  })

  const verifiedRemoved = !detectionSources.mdadmExamine
    && !detectionSources.wipefs
    && !detectionSources.blkid
    && remainingSignatureTypes.length === 0

  const zero = zeroSuperblock ?? {
    command: '(non exécuté)',
    exitCode: -1,
    stdout: '',
    stderr: '',
    success: false,
  }

  return {
    partition: devPath,
    zeroSuperblock: zero,
    mdadmExamine,
    wipefsProbe,
    blkidProbe,
    verifiedRemoved,
    remainingSignatureTypes,
    detectionSources,
    recommendedAction: computeRecommendedAction({
      zeroSuccess: zero.success,
      verifiedRemoved,
      remainingSignatureTypes,
    }),
  }
}

export function buildAdvancedWipeSignaturesCommand(
  partition: string,
  remainingSignatureTypes: string[],
): string {
  const devPath = sanitizeMdDevicePath(partition)
  const raidTypes = remainingSignatureTypes.filter(t => t !== 'mdadm_examine' && isRaidRelatedSignature(t))
  const unique = [...new Set(raidTypes)]

  if (unique.includes('linux_raid_member') || unique.some(t => t.toLowerCase() === 'linux_raid_member')) {
    return `wipefs --types=linux_raid_member -a ${devPath}`
  }
  if (unique.length > 0) {
    return `wipefs --types=${unique.join(',')} -a ${devPath}`
  }
  if (remainingSignatureTypes.length > 0) {
    return `wipefs -a ${devPath}`
  }
  throw createError({
    statusCode: 400,
    statusMessage: 'Aucune signature à effacer',
  })
}

export async function runZeroSuperblockCommand(
  manager: SSHSessionManager,
  partition: string,
): Promise<CommandProbeResult & { success: boolean }> {
  const devPath = sanitizeMdDevicePath(partition)
  const command = `mdadm --zero-superblock ${devPath}`
  const sshCommand = `${command} 2>&1; echo ${ZERO_EXIT_MARKER}=$?`
  let stdout = ''
  let stderr = ''
  let exitCode = 1
  try {
    const execResult = await manager.exec(sshCommand, 60_000)
    stdout = execResult.stdout ?? ''
    stderr = execResult.stderr ?? ''
    const match = stdout.match(new RegExp(`${ZERO_EXIT_MARKER}=(\\d+)`))
    exitCode = match ? Number(match[1]) : 1
    stdout = stdout.replace(new RegExp(`\\n?${ZERO_EXIT_MARKER}=\\d+\\s*$`), '').trim()
  } catch (err: any) {
    stdout = err?.data?.stdout ?? err?.stdout ?? ''
    stderr = err?.data?.stderr ?? err?.stderr ?? err?.message ?? ''
    const match = String(stdout).match(new RegExp(`${ZERO_EXIT_MARKER}=(\\d+)`))
    exitCode = match ? Number(match[1]) : 1
    stdout = String(stdout).replace(new RegExp(`\\n?${ZERO_EXIT_MARKER}=\\d+\\s*$`), '').trim()
  }
  return {
    command,
    exitCode,
    stdout: stdout.slice(0, 1500),
    stderr: stderr.slice(0, 500),
    success: exitCode === 0,
  }
}

export async function runWipeSignaturesCommand(
  manager: SSHSessionManager,
  partition: string,
  wipeCommand: string,
): Promise<CommandProbeResult & { success: boolean }> {
  const sshCommand = `${wipeCommand} 2>&1; echo ${PROBE_EXIT_MARKER}=$?`
  const probe = await execProbe(manager, sshCommand, 60_000)
  return { ...probe, success: probe.exitCode === 0 }
}

export async function zeroSuperblockWithDiagnostics(
  manager: SSHSessionManager,
  partition: string,
): Promise<ZeroMdSuperblockPartitionResult> {
  const devPath = sanitizeMdDevicePath(partition)
  console.info('[raid-md:zero-superblock]', { partition: devPath })

  const zeroSuperblock = await runZeroSuperblockCommand(manager, devPath)
  await runPostCleanupSync(manager, devPath)
  const diagnostics = await collectPartitionMetadataDiagnostics(manager, devPath, zeroSuperblock)

  const verifiedRemoved: boolean | null = diagnostics.verifiedRemoved
    ? true
    : (diagnostics.mdadmExamine.exitCode >= 0 ? false : null)

  const result: ZeroMdSuperblockPartitionResult = {
    partition: devPath,
    command: zeroSuperblock.command,
    success: zeroSuperblock.success,
    stdout: zeroSuperblock.stdout,
    stderr: zeroSuperblock.stderr,
    exitCode: zeroSuperblock.exitCode,
    verifiedRemoved,
    verificationStdout: diagnostics.mdadmExamine.stdout.slice(0, 1000),
    diagnostics,
  }

  console.info('[raid-md:zero-superblock]', {
    partition: devPath,
    success: result.success,
    exitCode: result.exitCode,
    verifiedRemoved: result.verifiedRemoved,
    detectionSources: diagnostics.detectionSources,
    remainingSignatureTypes: diagnostics.remainingSignatureTypes,
    recommendedAction: diagnostics.recommendedAction,
  })

  return result
}

export async function wipeSignaturesWithDiagnostics(
  manager: SSHSessionManager,
  partition: string,
  remainingSignatureTypes: string[],
): Promise<ZeroMdSuperblockPartitionResult> {
  const devPath = sanitizeMdDevicePath(partition)
  const wipeCommand = buildAdvancedWipeSignaturesCommand(devPath, remainingSignatureTypes)
  console.info('[raid-md:wipe-signatures]', { partition: devPath, wipeCommand })

  const wipeResult = await runWipeSignaturesCommand(manager, devPath, wipeCommand)
  await runPostCleanupSync(manager, devPath)
  const diagnostics = await collectPartitionMetadataDiagnostics(manager, devPath, wipeResult)

  const result: ZeroMdSuperblockPartitionResult = {
    partition: devPath,
    command: wipeCommand,
    success: wipeResult.success,
    stdout: wipeResult.stdout,
    stderr: wipeResult.stderr,
    exitCode: wipeResult.exitCode,
    verifiedRemoved: diagnostics.verifiedRemoved ? true : false,
    verificationStdout: diagnostics.mdadmExamine.stdout.slice(0, 1000),
    diagnostics,
  }

  console.info('[raid-md:wipe-signatures]', {
    partition: devPath,
    success: result.success,
    verifiedRemoved: result.verifiedRemoved,
    remainingSignatureTypes: diagnostics.remainingSignatureTypes,
  })

  return result
}

export function expectedMdWipeSignaturesConfirmation(): string {
  return MD_WIPE_SIGNATURES_CONFIRMATION
}

export function buildZeroCleanupFailureError(
  results: ZeroMdSuperblockPartitionResult[],
  warnings: string[],
): ReturnType<typeof createError> {
  const first = results.find(r => !r.success || r.verifiedRemoved === false || r.diagnostics?.verifiedRemoved === false)
  const diag = first?.diagnostics
  const message = diag
    ? buildDiagnosticsSummary(diag)
    : (first?.verifiedRemoved === false
      ? `Métadonnées MD encore présentes sur ${first?.partition ?? 'partition'}`
      : `Échec nettoyage sur ${first?.partition ?? 'partition'}`)

  return createError({
    statusCode: 422,
    statusMessage: 'MD metadata still present',
    message,
    data: {
      ok: false,
      results,
      warnings,
      advancedCleanupAvailable: results.some(r =>
        r.diagnostics?.recommendedAction === 'advanced_wipe_signatures',
      ),
    },
  })
}
