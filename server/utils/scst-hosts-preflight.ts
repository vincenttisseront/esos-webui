import type { ScstPreflightResult } from '~/types/scst-hosts'
import { readScstConfig } from './scst-config-reader'
import type { ScstConfig, Target } from '~/types/esos'
import { validateGroupName, validateInitiatorValue, initiatorAlreadyOnTarget, type InitiatorType } from '~/utils/scst-initiator-validation'
import { buildLunPreviewLine, validateMapLun, validateUnmapLun } from '~/utils/scst-lun-validation'

// Re-export findTarget from writer - it's not exported. Duplicate minimal lookup:

function findTarget(config: ScstConfig, targetName: string): Target | null {
  for (const driver of config.drivers) {
    const t = driver.targets.find(x => x.name === targetName)
    if (t) return t
  }
  return null
}

export async function preflightCreateGroup(
  targetName: string,
  groupName: string,
): Promise<ScstPreflightResult> {
  const config = await readScstConfig()
  const target = findTarget(config, targetName)
  const blockers: string[] = []
  const warnings: string[] = []
  const preview: string[] = []

  if (!target) {
    return { ok: false, configPreview: [], warnings, blockers: [`Target "${targetName}" introuvable`] }
  }

  const v = validateGroupName(groupName)
  if (!v.ok || !v.normalized) {
    blockers.push(v.message ?? 'Nom de groupe invalide')
    return { ok: false, configPreview: preview, warnings, blockers }
  }

  if (target.groups.some(g => g.name === v.normalized)) {
    blockers.push(`Le groupe "${v.normalized}" existe déjà`)
    return { ok: false, configPreview: preview, warnings, blockers }
  }

  preview.push(`GROUP ${v.normalized} {`, '\t# INITIATOR …', '\t# LUN …', '}')
  return { ok: true, configPreview: preview, warnings, blockers }
}

export async function preflightAddInitiator(
  targetName: string,
  groupName: string,
  initiator: string,
  type?: InitiatorType,
): Promise<ScstPreflightResult> {
  const config = await readScstConfig()
  const target = findTarget(config, targetName)
  if (!target) {
    return { ok: false, configPreview: [], warnings: [], blockers: [`Target "${targetName}" introuvable`] }
  }

  const group = target.groups.find(g => g.name === groupName)
  if (!group) {
    return { ok: false, configPreview: [], warnings: [], blockers: [`Groupe "${groupName}" introuvable`] }
  }

  const v = validateInitiatorValue(initiator, { type: type ?? 'auto' })
  if (!v.ok || !v.normalized) {
    return { ok: false, configPreview: [], warnings: [], blockers: [v.message ?? 'Initiateur invalide'] }
  }

  const warnings: string[] = []
  if (target.sessions.some(s => s.initiatorName.toLowerCase() === v.normalized!.toLowerCase())) {
    warnings.push('Une session active utilise cet initiateur — arrêtez les I/O avant modification si nécessaire.')
  }
  if (initiatorAlreadyOnTarget(target.groups, v.normalized, groupName)) {
    return { ok: false, configPreview: [], warnings, blockers: ['Initiateur déjà présent sur cette target'] }
  }

  return {
    ok: true,
    configPreview: [`INITIATOR ${v.normalized}`],
    warnings,
    blockers: [],
  }
}

export async function preflightMapLun(
  targetName: string,
  groupName: string,
  lunId: number,
  deviceName: string,
  readOnly?: boolean,
): Promise<ScstPreflightResult> {
  const config = await readScstConfig()
  const target = findTarget(config, targetName)
  if (!target) {
    return { ok: false, configPreview: [], warnings: [], blockers: [`Target "${targetName}" introuvable`] }
  }

  const v = validateMapLun(
    { lunId, deviceName, readOnly },
    { config, target, groupName },
  )
  if (!v.ok) {
    return { ok: false, configPreview: [], warnings: [], blockers: [v.message ?? v.errorKey ?? 'LUN invalide'] }
  }

  const warnings: string[] = []
  if (target.sessions.length > 0) {
    warnings.push('Des sessions actives existent sur cette target — arrêtez les I/O avant un changement de mappage si nécessaire.')
  }

  return {
    ok: true,
    configPreview: [v.previewLine ?? buildLunPreviewLine(lunId, deviceName, readOnly)],
    warnings,
    blockers: [],
  }
}

export async function preflightUnmapLun(
  targetName: string,
  groupName: string,
  lunId: number,
): Promise<ScstPreflightResult> {
  const config = await readScstConfig()
  const target = findTarget(config, targetName)
  if (!target) {
    return { ok: false, configPreview: [], warnings: [], blockers: [`Target "${targetName}" introuvable`] }
  }

  const v = validateUnmapLun(lunId, target, groupName)
  if (!v.ok) {
    return { ok: false, configPreview: [], warnings: [], blockers: [v.message ?? 'LUN introuvable'] }
  }

  const warnings: string[] = []
  const group = target.groups.find(g => g.name === groupName)
  const lun = group?.luns.find(l => l.id === lunId)
  if (lun && target.sessions.length > 0) {
    warnings.push('Des sessions actives existent — démapper un LUN peut interrompre l\'accès client.')
  }

  return {
    ok: true,
    configPreview: [`# remove LUN ${lunId} from GROUP ${groupName}`],
    warnings,
    blockers: [],
  }
}
