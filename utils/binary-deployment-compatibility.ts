import type { DeploymentBinaryDto } from '~/types/deployment'
import type { MissingToolsReadiness } from '~/types/missing-tools'

/** Hardware families detected on a SAN (aligns with RaidVendor where applicable). */
export type RaidHardwareFamily = 'dell_perc' | 'lsi_megaraid' | 'adaptec_aacraid' | 'unknown'

/** CLI tool identifiers used for compatibility and install state. */
export type RaidCliToolId = 'perccli' | 'perccli64' | 'storcli' | 'storcli64' | 'megacli64' | 'arcconf'

export type RaidCliToolGroup = 'megaraid_cli' | 'adaptec_cli'

export const HARDWARE_TO_TOOL_GROUPS: Record<Exclude<RaidHardwareFamily, 'unknown'>, RaidCliToolGroup[]> = {
  dell_perc: ['megaraid_cli'],
  lsi_megaraid: ['megaraid_cli'],
  adaptec_aacraid: ['adaptec_cli'],
}

/** Filename / catalog hints → tool group (extendable). */
export const BINARY_FILENAME_HINTS: Array<{ pattern: RegExp; group: RaidCliToolGroup; tools: RaidCliToolId[] }> = [
  { pattern: /perccli/i, group: 'megaraid_cli', tools: ['perccli64', 'perccli'] },
  { pattern: /storcli/i, group: 'megaraid_cli', tools: ['storcli64', 'storcli'] },
  { pattern: /megacli/i, group: 'megaraid_cli', tools: ['megacli64'] },
  { pattern: /arcconf/i, group: 'adaptec_cli', tools: ['arcconf'] },
]

export type InstalledToolsSnapshot = {
  perccli: boolean
  perccli64: boolean
  storcli: boolean
  storcli64: boolean
  arcconf: boolean
  megacli64: boolean
  resolvedPath: string | null
  version: string | null
}

export type SanDeploymentBinaryEntry = {
  binary: DeploymentBinaryDto
  toolGroup: RaidCliToolGroup | null
  toolIds: RaidCliToolId[]
}

export type SanBinaryDeploymentContext = {
  scannedAt: number
  hardwareKnown: boolean
  hardwareFamilies: RaidHardwareFamily[]
  controllerDetected: boolean
  controllerVendor: string | null
  controllerModel: string | null
  installedToolGroups: RaidCliToolGroup[]
  missingToolGroups: RaidCliToolGroup[]
  installedTools: InstalledToolsSnapshot
  primaryDeployables: SanDeploymentBinaryEntry[]
  installedCompatible: Array<{
    toolGroup: RaidCliToolGroup
    label: string
    version: string | null
    path: string | null
    matchingBinaries: DeploymentBinaryDto[]
  }>
  otherCatalogBinaries: DeploymentBinaryDto[]
  advancedDeployables: SanDeploymentBinaryEntry[]
}

export function vendorToHardwareFamily(
  vendor: string | null | undefined,
): RaidHardwareFamily | null {
  if (!vendor) return null
  if (vendor === 'dell_perc' || vendor === 'lsi_megaraid' || vendor === 'adaptec_aacraid') return vendor
  if (vendor === 'unknown') return 'unknown'
  return null
}

export function resolveHardwareFamilies(
  readiness: MissingToolsReadiness | null,
  controllerVendors?: RaidHardwareFamily[],
): RaidHardwareFamily[] {
  const families = new Set<RaidHardwareFamily>()
  const v = vendorToHardwareFamily(readiness?.controller.vendor ?? null)
  if (v && v !== 'unknown') families.add(v)
  for (const cv of controllerVendors ?? []) {
    if (cv && cv !== 'unknown') families.add(cv)
  }
  if (!families.size && readiness?.controller.detected) {
    families.add('unknown')
  }
  return [...families]
}

export function snapshotInstalledTools(
  tools: MissingToolsReadiness['tools'] | InstalledToolsSnapshot,
): InstalledToolsSnapshot {
  return {
    perccli: Boolean(tools.perccli),
    perccli64: Boolean(tools.perccli64),
    storcli: Boolean(tools.storcli),
    storcli64: Boolean(tools.storcli64),
    arcconf: Boolean((tools as InstalledToolsSnapshot).arcconf),
    megacli64: Boolean((tools as InstalledToolsSnapshot).megacli64),
    resolvedPath: tools.resolvedPath ?? null,
    version: tools.version ?? null,
  }
}

export function isMegaraidCliInstalled(t: InstalledToolsSnapshot): boolean {
  return t.perccli64 || t.perccli || t.storcli64 || t.storcli || t.megacli64
    || Boolean(t.resolvedPath && /perccli|storcli|megacli/i.test(t.resolvedPath))
}

export function isAdaptecCliInstalled(t: InstalledToolsSnapshot): boolean {
  return t.arcconf || Boolean(t.resolvedPath && /arcconf/i.test(t.resolvedPath))
}

export function isToolGroupInstalled(group: RaidCliToolGroup, t: InstalledToolsSnapshot): boolean {
  if (group === 'megaraid_cli') return isMegaraidCliInstalled(t)
  return isAdaptecCliInstalled(t)
}

export function requiredToolGroupsForHardware(
  families: RaidHardwareFamily[],
): RaidCliToolGroup[] {
  const groups = new Set<RaidCliToolGroup>()
  for (const f of families) {
    if (f === 'unknown') continue
    for (const g of HARDWARE_TO_TOOL_GROUPS[f]) groups.add(g)
  }
  return [...groups]
}

export function inferBinaryToolMeta(binary: DeploymentBinaryDto): {
  toolGroup: RaidCliToolGroup | null
  toolIds: RaidCliToolId[]
} {
  const haystack = `${binary.filename} ${binary.name} ${binary.installSpec.installKind ?? ''}`.toLowerCase()
  if (binary.installSpec.installKind === 'perccli') {
    return { toolGroup: 'megaraid_cli', toolIds: ['perccli64', 'perccli'] }
  }
  for (const hint of BINARY_FILENAME_HINTS) {
    if (hint.pattern.test(haystack)) {
      return { toolGroup: hint.group, tools: hint.tools }
    }
  }
  return { toolGroup: null, toolIds: [] }
}

export function binaryMatchesHardware(
  meta: { toolGroup: RaidCliToolGroup | null },
  families: RaidHardwareFamily[],
  requiredGroups: RaidCliToolGroup[],
): boolean {
  if (!meta.toolGroup) return false
  if (!requiredGroups.length) return false
  return requiredGroups.includes(meta.toolGroup)
}

export function buildSanBinaryDeploymentContext(params: {
  binaries: DeploymentBinaryDto[]
  readiness: MissingToolsReadiness | null
  extraHardwareFamilies?: RaidHardwareFamily[]
}): SanBinaryDeploymentContext {
  const deployable = params.binaries.filter(b =>
    b.status === 'available' || b.status === 'registered',
  )

  const hardwareFamilies = resolveHardwareFamilies(params.readiness, params.extraHardwareFamilies)
  const controllerDetected = Boolean(params.readiness?.controller.detected)
  const hardwareKnown = hardwareFamilies.some(f => f !== 'unknown')
    && controllerDetected
  const requiredGroups = hardwareKnown ? requiredToolGroupsForHardware(hardwareFamilies) : []

  const installed = params.readiness
    ? snapshotInstalledTools(params.readiness.tools)
    : snapshotInstalledTools({
        perccli: false, perccli64: false, storcli: false, storcli64: false,
        arcconf: false, megacli64: false, resolvedPath: null, version: null,
      })

  const installedToolGroups = (['megaraid_cli', 'adaptec_cli'] as const).filter(g =>
    isToolGroupInstalled(g, installed),
  )
  const missingToolGroups = requiredGroups.filter(g => !isToolGroupInstalled(g, installed))

  const entries: SanDeploymentBinaryEntry[] = deployable.map((binary) => {
    const meta = inferBinaryToolMeta(binary)
    return { binary, toolGroup: meta.toolGroup, toolIds: meta.toolIds }
  })

  const primaryDeployables = entries.filter((e) => {
    if (!hardwareKnown) return false
    if (!e.toolGroup || !missingToolGroups.includes(e.toolGroup)) return false
    return binaryMatchesHardware(e, hardwareFamilies, requiredGroups)
  })

  const installedCompatible = requiredGroups
    .filter(g => isToolGroupInstalled(g, installed))
    .map((toolGroup) => {
      const matchingBinaries = entries
        .filter(e => e.toolGroup === toolGroup)
        .map(e => e.binary)
      const label = toolGroup === 'megaraid_cli'
        ? (installed.resolvedPath?.split('/').pop() ?? 'perccli / storcli')
        : 'arcconf'
      return {
        toolGroup,
        label,
        version: installed.version,
        path: installed.resolvedPath,
        matchingBinaries,
      }
    })

  const primaryIds = new Set(primaryDeployables.map(e => e.binary.id))
  const installedIds = new Set(installedCompatible.flatMap(i => i.matchingBinaries.map(b => b.id)))

  const otherCatalogBinaries = entries
    .filter((e) => {
      if (primaryIds.has(e.binary.id)) return false
      if (installedIds.has(e.binary.id)) return false
      if (!hardwareKnown) return true
      if (!e.toolGroup) return true
      return !binaryMatchesHardware(e, hardwareFamilies, requiredGroups)
    })
    .map(e => e.binary)

  const advancedDeployables = entries.filter((e) => {
    if (!hardwareKnown) return true
    if (primaryIds.has(e.binary.id)) return false
    if (!e.toolGroup) return true
    return binaryMatchesHardware(e, hardwareFamilies, requiredGroups)
      && installedToolGroups.includes(e.toolGroup)
  })

  return {
    scannedAt: params.readiness?.scannedAt ?? Date.now(),
    hardwareKnown,
    hardwareFamilies,
    controllerDetected,
    controllerVendor: params.readiness?.controller.vendor ?? null,
    controllerModel: params.readiness?.controller.model ?? null,
    installedToolGroups,
    missingToolGroups,
    installedTools: installed,
    primaryDeployables,
    installedCompatible,
    otherCatalogBinaries,
    advancedDeployables,
  }
}
