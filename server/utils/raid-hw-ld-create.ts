/**
 * Hardware RAID logical drive creation — command execution and post-create verification.
 */
import { createError } from 'h3'
import type { SSHSessionManager } from './ssh-session-manager'
import type {
  CreateHardwareLogicalDriveRequest,
  HardwareRaidController,
  HardwareRaidLogicalDrive,
} from './raid-types'
import {
  buildPerccliAddVdHelpCommand,
  buildHwCliCreateLd,
  buildHwSetVdNameCommand,
  isRaidCliSyntaxError,
  normalizeHwVdNameInput,
  parseHardwareLdIdToVdIndex,
  supportsHwVdNameOnCreate,
  supportsHwVdNameOption,
  supportsHwVdNamePostCreate,
  validateHwVdName,
  type RaidCliCreateFlavor,
} from '../../utils/raid-hw-cli-create'
import {
  buildArcconfCreateLd,
  buildMegaCliCreateLd,
} from './raid-hardware'
import { collectRaidOverview } from './raid-overview.service'
import { resolveHwLdBackendContext } from '../../utils/hw-raid-backend-eligibility'
import { extractStorCliJsonPayload } from '../../utils/raid-cli-path'
import { invalidateCacheKey } from './cache'

export interface HwLdDriveSlot {
  enclosure?: string
  slot: string
}

export interface ShellExecParsed {
  exitCode: number
  stdout: string
  stderr: string
}

export interface HwLogicalDriveCreateResult {
  ok: boolean
  warning: boolean
  command: string
  exitCode: number
  stdout: string
  stderr: string
  controllerId: string
  requestedRaidLevel: string
  selectedSlots: string[]
  createdVirtualDriveId?: string
  verificationMessage?: string
  refreshCommand?: string
  refreshStdout?: string
  overviewRefreshed: boolean
  requestedVolumeName?: string
  nameApplyCommand?: string
  nameApplied?: boolean
  nameWarning?: string
  osDevicePath?: string
  osMappingStatus?: 'mapped' | 'unmapped'
  lvmEligible?: boolean
  fileioEligible?: boolean
  backendDiagnostics?: string[]
}

function withBackendContext(
  result: HwLogicalDriveCreateResult,
  overview: Awaited<ReturnType<typeof collectRaidOverview>>,
  createdVirtualDriveId: string | undefined,
): HwLogicalDriveCreateResult {
  if (!createdVirtualDriveId) return result
  const ctx = resolveHwLdBackendContext(
    overview.hardwareControllers,
    overview.blockDevices,
    createdVirtualDriveId,
  )
  if (!ctx) return result
  return {
    ...result,
    osDevicePath: ctx.osPath ?? undefined,
    osMappingStatus: ctx.osMappingStatus,
    lvmEligible: ctx.eligibility.lvmEligible,
    fileioEligible: ctx.eligibility.fileioEligible,
    backendDiagnostics: ctx.eligibility.reasons.length ? ctx.eligibility.reasons : undefined,
  }
}

export function hwLdDriveSlotKey(d: HwLdDriveSlot): string {
  return `${d.enclosure ?? '252'}:${d.slot}`
}

export function parseShellExecOutput(raw: string): ShellExecParsed {
  const exitMatch = raw.match(/EXIT_CODE=(\d+)\s*$/m)
  const exitCode = exitMatch ? Number(exitMatch[1]) : 0
  const combined = exitMatch ? raw.slice(0, exitMatch.index).trimEnd() : raw.trimEnd()
  return { exitCode, stdout: combined, stderr: '' }
}

export function isStorCliExecFailure(raw: string): boolean {
  const { exitCode, stdout } = parseShellExecOutput(raw)
  if (exitCode !== 0) return true
  if (isRaidCliSyntaxError(stdout)) return true
  const text = stdout
  if (/Status\s*=\s*Failure/i.test(text)) return true
  if (/Command Status\s*=\s*Failed/i.test(text)) return true
  if (/Overall Status\s*:\s*Failed/i.test(text)) return true
  if (/\bDescription\s*=\s*.*\b(error|fail)/i.test(text)) return true
  try {
    const payload = extractStorCliJsonPayload(text)
    if (!payload) return false
    const data = JSON.parse(payload) as Record<string, unknown>
    const status = JSON.stringify(data)
    if (/"(?:Status|Command Status)"\s*:\s*"(?:Failure|Failed)"/i.test(status)) return true
  } catch { /* not JSON */ }
  return false
}

export function isMegaCliExecFailure(raw: string): boolean {
  const { exitCode, stdout } = parseShellExecOutput(raw)
  if (exitCode !== 0) return true
  return /\b(error|fail|exit code)\b/i.test(stdout)
}

export function isArcconfExecFailure(raw: string): boolean {
  const { exitCode, stdout } = parseShellExecOutput(raw)
  if (exitCode !== 0) return true
  return /\b(error|failed|unable)\b/i.test(stdout)
}

export function isHwCliExecFailure(cliTool: HardwareRaidController['cliTool'], raw: string): boolean {
  if (cliTool === 'storcli' || cliTool === 'perccli') return isStorCliExecFailure(raw)
  if (cliTool === 'MegaCli64') return isMegaCliExecFailure(raw)
  if (cliTool === 'arcconf') return isArcconfExecFailure(raw)
  return parseShellExecOutput(raw).exitCode !== 0
}

export function parseStorCliCreatedVdId(stdout: string): string | undefined {
  const vdMatch = stdout.match(/VD\s*[:=]?\s*(\d+)/i)
    ?? stdout.match(/"VD"\s*:\s*(\d+)/i)
    ?? stdout.match(/Virtual Drive\s+(\d+)/i)
  if (vdMatch) return vdMatch[1]
  return undefined
}

export function buildStorCliControllerRefreshCommand(cli: string, ctrlIndex: string): string {
  const qCli = cli.replace(/'/g, `'\\''`)
  return `${qCli} /c${ctrlIndex}/vall show all J`
}

export function resolveValidatedHwVdName(
  raw: string | undefined,
  cliTool: HardwareRaidController['cliTool'],
): string | undefined {
  const trimmed = normalizeHwVdNameInput(raw)
  if (!trimmed) return undefined
  if (cliTool !== 'perccli' && cliTool !== 'storcli') {
    throw createError({
      statusCode: 422,
      statusMessage: 'Le nom de volume n\'est pas supporté par l\'outil CLI de ce contrôleur',
    })
  }
  const flavor = cliTool as RaidCliCreateFlavor
  if (!supportsHwVdNameOption(flavor)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Le nom de volume n\'est pas supporté par l\'outil CLI de ce contrôleur',
    })
  }
  const result = validateHwVdName(trimmed, flavor)
  if (!result.ok) {
    const msg = result.error === 'invalid_chars'
      ? 'Nom de volume invalide : lettres, chiffres, tiret, underscore et point uniquement (pas d\'espace)'
      : `Nom de volume trop long (max ${flavor === 'perccli' ? 15 : 32} caractères)`
    throw createError({ statusCode: 400, statusMessage: msg })
  }
  return result.name || undefined
}

export function buildHwLogicalDriveCreateCommand(
  ctrl: HardwareRaidController,
  body: Pick<CreateHardwareLogicalDriveRequest, 'raidLevel' | 'drives' | 'readPolicy' | 'writePolicy' | 'name'>,
): string {
  if (ctrl.cliTool === 'storcli' || ctrl.cliTool === 'perccli') {
    const cliBin = ctrl.cliPath ?? ctrl.cliTool
    const flavor = ctrl.cliTool as RaidCliCreateFlavor
    const volumeNameOnCreate = supportsHwVdNameOnCreate(flavor)
      ? resolveValidatedHwVdName(body.name, ctrl.cliTool)
      : undefined
    return buildHwCliCreateLd({
      cli: cliBin,
      ctrlIndex: ctrl.id,
      raidLevel: body.raidLevel,
      drives: body.drives,
      writePolicy: body.writePolicy,
      readPolicy: body.readPolicy,
      flavor: ctrl.cliTool,
      includeCachePolicies: ctrl.cliTool === 'storcli',
      volumeName: volumeNameOnCreate,
    })
  }
  if (ctrl.cliTool === 'MegaCli64') {
    return buildMegaCliCreateLd(ctrl.id, body.raidLevel, body.drives, body.writePolicy, body.readPolicy)
  }
  if (ctrl.cliTool === 'arcconf') {
    return buildArcconfCreateLd(ctrl.id, body.raidLevel, body.drives, body.writePolicy, body.readPolicy)
  }
  throw createError({ statusCode: 422, statusMessage: 'Outil CLI inconnu pour ce contrôleur' })
}

export function validateHwCreateDriveSelection(
  ctrl: HardwareRaidController,
  drives: HwLdDriveSlot[],
): void {
  if (ctrl.controllerMode?.mode === 'hba') {
    throw createError({
      statusCode: 422,
      statusMessage: 'Le contrôleur est en mode HBA — création de volume matériel indisponible',
    })
  }

  for (const d of drives) {
    const key = hwLdDriveSlotKey(d)
    const pd = ctrl.physicalDrives.find(p =>
      String(p.slot) === String(d.slot)
      && String(p.enclosure ?? '252') === String(d.enclosure ?? '252'),
    )
    if (!pd) {
      throw createError({ statusCode: 400, statusMessage: `Disque physique ${key} introuvable sur le contrôleur` })
    }
    if (!pd.eligible || pd.state !== 'unconfigured_good') {
      throw createError({
        statusCode: 422,
        statusMessage: `Disque ${key} non éligible (état: ${pd.state}, UGood requis)`,
      })
    }
  }

}

export function verifyHwLogicalDriveCreated(
  before: HardwareRaidLogicalDrive[],
  after: HardwareRaidLogicalDrive[],
  raidLevel: string,
  controllerId: string,
  parsedVdNum?: string,
): { verified: boolean; createdVirtualDriveId?: string; message?: string } {
  if (parsedVdNum) {
    const candidateId = `${controllerId}/vd${parsedVdNum}`
    if (after.some(ld => ld.id === candidateId)) {
      return { verified: true, createdVirtualDriveId: candidateId }
    }
  }

  const beforeIds = new Set(before.map(ld => ld.id))
  const newLds = after.filter(ld => !beforeIds.has(ld.id))
  if (newLds.length > 0) {
    const match = newLds.find(ld => ld.raidLevel === raidLevel) ?? newLds[0]
    return { verified: true, createdVirtualDriveId: match.id }
  }

  if (after.length > before.length) {
    const added = after.find(ld => !beforeIds.has(ld.id)) ?? after[after.length - 1]
    return { verified: true, createdVirtualDriveId: added.id }
  }

  const levelMatch = after.filter(ld => ld.raidLevel === raidLevel)
  if (levelMatch.length > before.filter(ld => ld.raidLevel === raidLevel).length) {
    const added = levelMatch[levelMatch.length - 1]
    return { verified: true, createdVirtualDriveId: added.id, message: 'Volume détecté par niveau RAID (ID incertain)' }
  }

  return {
    verified: false,
    message: 'Aucun nouveau volume logique détecté après rafraîchissement du contrôleur',
  }
}

const SCSI_HOST_RESCAN_CMD = 'for _h in /sys/class/scsi_host/host*/scan; do [ -w "$_h" ] && echo "- - -" > "$_h"; done 2>/dev/null || true'

const HW_VD_NAME_NOT_APPLIED_WARNING = 'Volume créé, mais le nom n\'a pas été appliqué.'

export async function tryApplyHwVdNameAfterCreate(
  manager: SSHSessionManager,
  ctrl: HardwareRaidController,
  createdVirtualDriveId: string,
  name: string,
): Promise<{ applied: boolean; command?: string; warning?: string; stdout?: string }> {
  const flavor = ctrl.cliTool as RaidCliCreateFlavor
  if (!supportsHwVdNamePostCreate(flavor)) {
    return { applied: false, warning: HW_VD_NAME_NOT_APPLIED_WARNING }
  }
  const vdIndex = parseHardwareLdIdToVdIndex(createdVirtualDriveId)
  if (!vdIndex) {
    return { applied: false, warning: HW_VD_NAME_NOT_APPLIED_WARNING }
  }
  const cliBin = ctrl.cliPath ?? ctrl.cliTool
  const command = buildHwSetVdNameCommand({
    cli: cliBin,
    ctrlIndex: ctrl.id,
    vdIndex,
    name,
    flavor,
  })
  try {
    const execRaw = await manager.exec(`${command} 2>&1; echo EXIT_CODE=$?`, 30_000)
    const parsed = parseShellExecOutput(execRaw.stdout)
    if (isHwCliExecFailure(ctrl.cliTool, execRaw.stdout)) {
      return {
        applied: false,
        command,
        warning: HW_VD_NAME_NOT_APPLIED_WARNING,
        stdout: parsed.stdout.slice(0, 1000),
      }
    }
    return { applied: true, command, stdout: parsed.stdout.slice(0, 500) }
  } catch {
    return { applied: false, command, warning: HW_VD_NAME_NOT_APPLIED_WARNING }
  }
}

function buildCreateResultBase(
  command: string,
  parsed: ShellExecParsed,
  body: CreateHardwareLogicalDriveRequest,
  selectedSlots: string[],
  refreshCommand?: string,
  refreshStdout?: string,
  requestedVolumeName?: string,
): Omit<HwLogicalDriveCreateResult, 'ok' | 'warning' | 'createdVirtualDriveId' | 'verificationMessage' | 'nameApplyCommand' | 'nameApplied' | 'nameWarning'> {
  return {
    command,
    exitCode: parsed.exitCode,
    stdout: parsed.stdout.slice(0, 4000),
    stderr: parsed.stderr,
    controllerId: body.controllerId,
    requestedRaidLevel: body.raidLevel,
    selectedSlots,
    refreshCommand,
    refreshStdout,
    overviewRefreshed: true,
    requestedVolumeName,
  }
}

async function applyOptionalVolumeName(
  manager: SSHSessionManager,
  ctrl: HardwareRaidController,
  createdVirtualDriveId: string | undefined,
  requestedVolumeName: string | undefined,
): Promise<Pick<HwLogicalDriveCreateResult, 'nameApplyCommand' | 'nameApplied' | 'nameWarning' | 'warning'>> {
  if (!requestedVolumeName || !createdVirtualDriveId) {
    return { nameApplied: false, warning: false }
  }
  const nameResult = await tryApplyHwVdNameAfterCreate(
    manager,
    ctrl,
    createdVirtualDriveId,
    requestedVolumeName,
  )
  if (nameResult.applied) {
    return {
      nameApplied: true,
      nameApplyCommand: nameResult.command,
      warning: false,
    }
  }
  return {
    nameApplied: false,
    nameApplyCommand: nameResult.command,
    nameWarning: nameResult.warning ?? HW_VD_NAME_NOT_APPLIED_WARNING,
    warning: true,
  }
}

export async function executeHwLogicalDriveCreate(
  manager: SSHSessionManager,
  cacheKey: string,
  ctrl: HardwareRaidController,
  body: CreateHardwareLogicalDriveRequest,
): Promise<HwLogicalDriveCreateResult> {
  validateHwCreateDriveSelection(ctrl, body.drives)

  if (!body.readPolicy || !body.writePolicy) {
    throw createError({ statusCode: 400, statusMessage: 'readPolicy et writePolicy requis' })
  }

  const selectedSlots = body.drives.map(hwLdDriveSlotKey)
  const beforeLds = [...ctrl.logicalDrives]
  const requestedVolumeName = body.name?.trim()
    ? resolveValidatedHwVdName(body.name, ctrl.cliTool)
    : undefined
  const command = buildHwLogicalDriveCreateCommand(ctrl, body)

  const execRaw = await manager.exec(`${command} 2>&1; echo EXIT_CODE=$?`, 120_000)
  const parsed = parseShellExecOutput(execRaw.stdout)

  if (isHwCliExecFailure(ctrl.cliTool, execRaw.stdout)) {
    const syntaxError = (ctrl.cliTool === 'storcli' || ctrl.cliTool === 'perccli')
      && isRaidCliSyntaxError(parsed.stdout)
    const cliBin = ctrl.cliPath ?? ctrl.cliTool
    const helpCommand = (ctrl.cliTool === 'storcli' || ctrl.cliTool === 'perccli')
      ? buildPerccliAddVdHelpCommand(cliBin, ctrl.id)
      : undefined
    const statusMessage = syntaxError && ctrl.cliTool === 'perccli'
      ? `Commande perccli invalide. Vérifiez la syntaxe avec : ${helpCommand}`
      : syntaxError
        ? `Commande CLI invalide (syntaxe). Consultez l'aide : ${helpCommand}`
        : `Échec création LD : ${parsed.stdout.slice(-800)}`
    throw createError({
      statusCode: 500,
      statusMessage,
      data: {
        command,
        exitCode: parsed.exitCode,
        stdout: parsed.stdout.slice(0, 4000),
        stderr: parsed.stderr,
        controllerId: body.controllerId,
        requestedRaidLevel: body.raidLevel,
        selectedSlots,
        syntaxError,
        helpCommand,
      },
    })
  }

  const parsedVdNum = (ctrl.cliTool === 'storcli' || ctrl.cliTool === 'perccli')
    ? parseStorCliCreatedVdId(parsed.stdout)
    : undefined

  invalidateCacheKey(cacheKey)

  let refreshCommand: string | undefined
  let refreshStdout: string | undefined
  if (ctrl.cliTool === 'storcli' || ctrl.cliTool === 'perccli') {
    refreshCommand = buildStorCliControllerRefreshCommand(ctrl.cliPath ?? ctrl.cliTool, ctrl.id)
    try {
      const refreshExec = await manager.exec(`${refreshCommand} 2>&1; echo EXIT_CODE=$?`, 45_000)
      refreshStdout = parseShellExecOutput(refreshExec.stdout).stdout.slice(0, 2000)
    } catch {
      refreshStdout = 'Rafraîchissement contrôleur ignoré (timeout ou erreur SSH)'
    }
  }

  try {
    await manager.exec(SCSI_HOST_RESCAN_CMD, 15_000)
  } catch { /* best effort */ }

  const overview = await collectRaidOverview(manager)
  const refreshedCtrl = overview.hardwareControllers.find(c => c.id === body.controllerId)
  const afterLds = refreshedCtrl?.logicalDrives ?? []

  const verification = verifyHwLogicalDriveCreated(beforeLds, afterLds, body.raidLevel, ctrl.id, parsedVdNum)
  const canVerify = ctrl.cliTool === 'storcli' || ctrl.cliTool === 'perccli' || ctrl.cliTool === 'MegaCli64' || ctrl.cliTool === 'arcconf'

  const createdVirtualDriveId = verification.createdVirtualDriveId
    ?? (parsedVdNum ? `${ctrl.id}/vd${parsedVdNum}` : undefined)

  const base = buildCreateResultBase(
    command,
    parsed,
    body,
    selectedSlots,
    refreshCommand,
    refreshStdout,
    requestedVolumeName,
  )

  if (canVerify && !verification.verified) {
    return withBackendContext({
      ok: false,
      warning: true,
      ...base,
      createdVirtualDriveId,
      verificationMessage: verification.message,
    }, overview, createdVirtualDriveId)
  }

  const nameOutcome = await applyOptionalVolumeName(
    manager,
    ctrl,
    createdVirtualDriveId,
    requestedVolumeName,
  )

  return withBackendContext({
    ok: true,
    warning: nameOutcome.warning ?? false,
    ...base,
    createdVirtualDriveId,
    verificationMessage: verification.message,
    nameApplyCommand: nameOutcome.nameApplyCommand,
    nameApplied: nameOutcome.nameApplied,
    nameWarning: nameOutcome.nameWarning,
  }, overview, createdVirtualDriveId)
}
