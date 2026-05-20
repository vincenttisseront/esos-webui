import { bindScstBlocker } from '~/utils/lvm-bind-scst-blockers'
import { buildLvPathCandidates } from '~/utils/lvm-lv-path'
import type { ScstDeviceIndex } from './scst-device-index'
import type {
  BindScstPayload,
  LvCreatePayload,
  LvmOverviewResponse,
  PvCreatePayload,
  PvRemovePayload,
  VgCreatePayload,
  VgRemovePayload,
  LvRemovePayload,
} from './lvm-types'

const NAME_RE = /^[a-zA-Z0-9_+.-]{1,128}$/
const RESERVED_VG = new Set(['snapshot', 'pvmove', 'vgimported', 'vgchanged'])
const MD_PATH_RE = /^\/dev\/md[a-z0-9_-]{0,15}$/i
const DEV_PATH_RE = /^\/dev\/[a-z0-9][a-z0-9_-]*$/i

export function isValidLvmName(name: string): boolean {
  return NAME_RE.test(name) && !RESERVED_VG.has(name.toLowerCase())
}

export function isValidDevicePath(path: string): boolean {
  return DEV_PATH_RE.test(path) || MD_PATH_RE.test(path)
}

export function expectedPvCreateConfirmation(path: string): string {
  return `PVCREATE ${path}`
}

export function expectedVgCreateConfirmation(name: string): string {
  return `VGCREATE ${name}`
}

export function expectedLvCreateConfirmation(vgName: string, lvName: string): string {
  return `LVCREATE ${vgName}/${lvName}`
}

export function expectedPvRemoveConfirmation(path: string): string {
  return `PVREMOVE ${path}`
}

export function expectedVgRemoveConfirmation(name: string): string {
  return `VGREMOVE ${name}`
}

export function expectedLvRemoveConfirmation(vgName: string, lvName: string): string {
  return `LVREMOVE ${vgName}/${lvName}`
}

export function expectedBindScstConfirmation(deviceName: string): string {
  return `SCST DEVICE ${deviceName}`
}

export function validatePvCreate(
  payload: Partial<PvCreatePayload>,
  overview: LvmOverviewResponse,
): { blockers: string[]; warnings: string[]; path?: string } {
  const blockers: string[] = []
  const warnings: string[] = []
  const path = String(payload.path ?? '').trim()
  if (!path) blockers.push('Chemin du périphérique requis')
  else if (!isValidDevicePath(path)) blockers.push('Chemin de périphérique invalide')
  const cand = overview.candidates.find(c => c.path === path)
  if (!cand) blockers.push('Périphérique absent du scan ou non éligible — rafraîchissez l\'aperçu')
  else if (!cand.eligible && !payload.force) {
    for (const r of cand.reasons) blockers.push(r)
  } else if (!cand.eligible && payload.force) {
    warnings.push('pvcreate --force : signatures existantes seront écrasées')
  }
  if (overview.pvs.some(p => p.path === path)) blockers.push('Déjà volume physique LVM')
  if (overview.tools.clvmd && overview.vgs.some(v => v.clustered)) {
    blockers.push('Volumes clusterisés (clvmd) — création PV non supportée via la WebUI')
  }
  return { blockers, warnings, path }
}

export function validateVgCreate(
  payload: Partial<VgCreatePayload>,
  overview: LvmOverviewResponse,
): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = []
  const warnings: string[] = []
  const name = String(payload.name ?? '').trim()
  const pvPaths = Array.isArray(payload.pvPaths) ? payload.pvPaths.map(p => String(p).trim()) : []
  if (!isValidLvmName(name)) blockers.push('Nom de VG invalide')
  if (overview.vgs.some(v => v.name === name)) blockers.push(`VG ${name} existe déjà`)
  if (!pvPaths.length) blockers.push('Au moins un PV requis')
  for (const p of pvPaths) {
    const pv = overview.pvs.find(x => x.path === p)
    if (!pv) blockers.push(`PV introuvable : ${p}`)
    else if (pv.vgName) blockers.push(`${p} appartient déjà au VG ${pv.vgName}`)
  }
  if (overview.vgs.some(v => v.clustered)) {
    blockers.push('VG clusterisé (clvmd) — vgcreate non supporté via la WebUI')
  }
  return { blockers, warnings }
}

export function validateLvCreate(
  payload: Partial<LvCreatePayload>,
  overview: LvmOverviewResponse,
): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = []
  const warnings: string[] = []
  const vgName = String(payload.vgName ?? '').trim()
  const name = String(payload.name ?? '').trim()
  const sizeBytes = Number(payload.sizeBytes)
  const vg = overview.vgs.find(v => v.name === vgName)
  if (!vg) blockers.push(`VG ${vgName} introuvable`)
  if (!isValidLvmName(name)) blockers.push('Nom de LV invalide')
  if (overview.lvs.some(l => l.vgName === vgName && l.name === name)) {
    blockers.push(`LV ${vgName}/${name} existe déjà`)
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) blockers.push('Taille LV invalide')
  if (vg && sizeBytes > vg.freeBytes) blockers.push('Taille LV supérieure à l\'espace libre du VG')
  if (vg?.clustered) blockers.push('VG clusterisé — lvcreate non supporté via la WebUI')
  return { blockers, warnings }
}

export function validatePvRemove(payload: Partial<PvRemovePayload>, overview: LvmOverviewResponse) {
  const blockers: string[] = []
  const path = String(payload.path ?? '').trim()
  const pv = overview.pvs.find(p => p.path === path)
  if (!pv) blockers.push('PV introuvable')
  if (pv?.vgName) blockers.push(`Retirez d\'abord le PV du VG ${pv.vgName}`)
  return { blockers, warnings: [] as string[] }
}

export function validateVgRemove(payload: Partial<VgRemovePayload>, overview: LvmOverviewResponse) {
  const blockers: string[] = []
  const name = String(payload.name ?? '').trim()
  const vg = overview.vgs.find(v => v.name === name)
  if (!vg) blockers.push('VG introuvable')
  if (overview.lvs.some(l => l.vgName === name)) blockers.push('Supprimez d\'abord tous les LV du VG')
  if (vg?.clustered) blockers.push('VG clusterisé — suppression non supportée')
  return { blockers, warnings: [] as string[] }
}

export function validateLvRemove(payload: Partial<LvRemovePayload>, overview: LvmOverviewResponse) {
  const blockers: string[] = []
  const vgName = String(payload.vgName ?? '').trim()
  const name = String(payload.name ?? '').trim()
  const lv = overview.lvs.find(l => l.vgName === vgName && l.name === name)
  if (!lv) blockers.push('LV introuvable')
  if (lv?.usedBy.includes('scst')) blockers.push('LV exporté via SCST — retirez le device SCST d\'abord')
  return { blockers, warnings: [] as string[] }
}

export function validateBindScst(
  payload: Partial<BindScstPayload>,
  overview: LvmOverviewResponse,
  index: ScstDeviceIndex,
  ctx: { nodeLabel: string; lvPathPresent?: boolean; resolvedBackingPath?: string },
): { blockers: string[]; warnings: string[]; lvPath?: string } {
  const blockers: string[] = []
  const warnings: string[] = []
  const vgName = String(payload.vgName ?? '').trim()
  const lvName = String(payload.lvName ?? '').trim()
  const deviceName = String(payload.deviceName ?? '').trim()
  const nodeLabel = ctx.nodeLabel
  const lv = overview.lvs.find(l => l.vgName === vgName && l.name === lvName)
  const pathCandidates = lv?.pathCandidates
    ?? (lv ? buildLvPathCandidates(lv.vgName, lv.name) : buildLvPathCandidates(vgName, lvName))
  const lvPath = ctx.resolvedBackingPath ?? lv?.path

  if (!lv) {
    blockers.push(bindScstBlocker('lv_not_found', `${vgName}/${lvName}`))
  }
  if (lv && ctx.lvPathPresent === false) {
    const missingPath = lvPath ?? pathCandidates[0] ?? `${vgName}/${lvName}`
    blockers.push(bindScstBlocker('lv_path_missing', missingPath, nodeLabel))
  }
  if (!deviceName) blockers.push('Nom de device SCST requis')
  else if (deviceName.length > 32) blockers.push('Nom de device SCST : maximum 32 caractères')
  else if (!/^[A-Za-z0-9_\-]+$/.test(deviceName)) blockers.push('Nom de device SCST invalide')
  if (deviceName && index.names.has(deviceName)) {
    blockers.push(bindScstBlocker('device_exists', deviceName, nodeLabel))
  }
  for (const candidate of pathCandidates) {
    const bound = index.pathToDevices.get(candidate) ?? []
    const other = bound.find(n => n !== deviceName)
    if (other) {
      blockers.push(bindScstBlocker('lv_path_in_use', candidate, other, nodeLabel))
      break
    }
  }
  if (lv?.scstDeviceNames?.length) {
    blockers.push(bindScstBlocker('lv_path_in_use', lvPath ?? lv.path, lv.scstDeviceNames[0]!, nodeLabel))
  }
  return { blockers, warnings, lvPath: lvPath ?? lv?.path }
}
