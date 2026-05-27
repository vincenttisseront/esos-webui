/**
 * Hardware RAID CLI create-VD command builder (perccli / storcli).
 *
 * perccli 1.17.x (legacy): `/cX add vd r1 drives=e:s[,e:s]` — RAID level as r0|r1|r5|r6|r10.
 * Optional cache tokens: `wt|wb` and `nora|ra` only (no ADRA).
 *
 * storcli (modern): `/cX add vd type=raid5 drives=...` with wt/wb and nora|ra|adra.
 *
 * Verify on target host: `perccli /c0 add vd` or `perccli /c0 add help`
 */
import { inferRaidCliTool } from '~/utils/raid-cli-path'

export type RaidCliCreateFlavor = 'perccli' | 'storcli'

export type HwCliRaidLevel = '0' | '1' | '5' | '6' | '10'
export type HwCliWritePolicy = 'WT' | 'WB'
export type HwCliReadPolicy = 'NORA' | 'RA' | 'ADRA'

export interface HwCliDriveSlot {
  enclosure?: string
  slot: string
}

export interface BuildHwCliCreateLdOptions {
  cli: string
  ctrlIndex: string
  raidLevel: string
  drives: HwCliDriveSlot[]
  writePolicy?: HwCliWritePolicy
  readPolicy?: HwCliReadPolicy
  /** Defaults from cli path when omitted */
  flavor?: RaidCliCreateFlavor
  /**
   * Append cache policy tokens. Off by default for perccli 1.17.x compatibility.
   */
  includeCachePolicies?: boolean
}

/** Map WebUI RAID level to perccli `rX` token (not `type=raidX`). */
export function mapRaidLevelToPerccliRx(raidLevel: string): string {
  switch (raidLevel) {
    case '0': return 'r0'
    case '1': return 'r1'
    case '5': return 'r5'
    case '6': return 'r6'
    case '10': return 'r10'
    default: return `r${raidLevel}`
  }
}

export function mapRaidLevelToStorcliType(raidLevel: string): string {
  return `raid${raidLevel}`
}

/** perccli 1.17 supports nora|ra only — ADRA is mapped to ra when policies are included. */
export function mapPerccliReadPolicyToken(readPolicy: HwCliReadPolicy): 'nora' | 'ra' {
  return readPolicy === 'RA' || readPolicy === 'ADRA' ? 'ra' : 'nora'
}

export function shellQuoteCliPath(cli: string): string {
  return cli.replace(/'/g, `'\\''`)
}

export function formatHwCliDriveList(drives: HwCliDriveSlot[], defaultEnclosure = '252'): string {
  return drives.map(d => `${d.enclosure ?? defaultEnclosure}:${d.slot}`).join(',')
}

export function buildPerccliAddVdHelpCommand(cli: string, ctrlIndex: string): string {
  return `${shellQuoteCliPath(cli)} /c${ctrlIndex} add vd`
}

export function buildPerccliCreateLd(options: BuildHwCliCreateLdOptions): string {
  const qCli = shellQuoteCliPath(options.cli)
  const rx = mapRaidLevelToPerccliRx(options.raidLevel)
  const driveStr = formatHwCliDriveList(options.drives)
  let cmd = `${qCli} /c${options.ctrlIndex} add vd ${rx} drives=${driveStr}`
  if (options.includeCachePolicies) {
    const wp = (options.writePolicy ?? 'WT').toLowerCase()
    const rp = mapPerccliReadPolicyToken(options.readPolicy ?? 'NORA')
    cmd += ` ${wp} ${rp}`
  }
  return cmd
}

export function buildStorcliModernCreateLd(options: BuildHwCliCreateLdOptions): string {
  const qCli = shellQuoteCliPath(options.cli)
  const type = mapRaidLevelToStorcliType(options.raidLevel)
  const driveStr = formatHwCliDriveList(options.drives)
  const wp = (options.writePolicy ?? 'WT').toLowerCase()
  const rp = (options.readPolicy ?? 'ADRA').toLowerCase()
  return `${qCli} /c${options.ctrlIndex} add vd type=${type} drives=${driveStr} ${wp} ${rp}`
}

export function resolveRaidCliCreateFlavor(cli: string, flavor?: RaidCliCreateFlavor): RaidCliCreateFlavor {
  if (flavor) return flavor
  return inferRaidCliTool(cli)
}

/**
 * Build create-VD command for perccli (legacy rX) or storcli (type=raidX).
 */
export function buildHwCliCreateLd(options: BuildHwCliCreateLdOptions): string {
  const flavor = resolveRaidCliCreateFlavor(options.cli, options.flavor)
  if (flavor === 'perccli') {
    return buildPerccliCreateLd({
      ...options,
      includeCachePolicies: options.includeCachePolicies ?? false,
    })
  }
  return buildStorcliModernCreateLd({
    ...options,
    includeCachePolicies: options.includeCachePolicies ?? true,
  })
}

/** Detect perccli/storcli syntax errors even when shell exit code is 0. */
export function isRaidCliSyntaxError(stdout: string): boolean {
  return /syntax\s+error/i.test(stdout)
    || /unexpected\s+TOKEN/i.test(stdout)
    || /unknown\s+command/i.test(stdout)
    || /invalid\s+(?:command|syntax|token)/i.test(stdout)
    || /unrecognized\s+option/i.test(stdout)
}
