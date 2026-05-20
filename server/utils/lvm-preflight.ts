import type { SSHSessionManager } from './ssh-session-manager'
import type { LvmOverviewResponse, LvmPreflightRequest, LvmPreflightResult, LvmRiskLevel } from './lvm-types'
import {
  validateBindScst,
  validateLvCreate,
  validateLvRemove,
  validatePvCreate,
  validatePvRemove,
  validateVgCreate,
  validateVgRemove,
  expectedBindScstConfirmation,
  expectedLvCreateConfirmation,
  expectedLvRemoveConfirmation,
  expectedPvCreateConfirmation,
  expectedPvRemoveConfirmation,
  expectedVgCreateConfirmation,
  expectedVgRemoveConfirmation,
} from './lvm-validation'
import {
  buildLvCreatePreview,
  buildPvCreatePreview,
  buildVgCreatePreview,
} from './lvm-actions'
import { getSanSummary } from '../db/repositories/san.repository'
import { getCurrentSanId } from './ssh-runtime'
import { buildLvPathCandidates } from '~/utils/lvm-lv-path'
import { resolveBlockDevicePathFromCandidates } from './lvm-lv-device-path'
import { readScstDeviceIndex } from './scst-device-index'

const RISK: Record<LvmPreflightRequest['action'], LvmRiskLevel> = {
  pvcreate: 'destructive',
  vgcreate: 'risky',
  lvcreate: 'risky',
  pvremove: 'destructive',
  vgremove: 'destructive',
  lvremove: 'destructive',
  bind_scst: 'risky',
}

export async function runLvmPreflight(
  _manager: SSHSessionManager,
  req: LvmPreflightRequest,
  overview: LvmOverviewResponse,
): Promise<LvmPreflightResult> {
  const blockers: string[] = []
  const warnings: string[] = []
  let requiredConfirmation = ''
  let commandPreview: string | undefined
  const impactedDevices: string[] = []

  if (!overview.tools.pvcreate && ['pvcreate', 'pvremove'].includes(req.action)) {
    blockers.push('pvcreate/pvremove indisponible sur ce nœud')
  }
  if (!overview.tools.vgcreate && ['vgcreate', 'vgremove'].includes(req.action)) {
    blockers.push('vgcreate/vgremove indisponible sur ce nœud')
  }
  if (!overview.tools.lvcreate && ['lvcreate', 'lvremove'].includes(req.action)) {
    blockers.push('lvcreate/lvremove indisponible sur ce nœud')
  }

  const p = req.payload as Record<string, unknown>

  switch (req.action) {
    case 'pvcreate': {
      const v = validatePvCreate(p as any, overview)
      blockers.push(...v.blockers)
      warnings.push(...v.warnings)
      if (v.path) {
        impactedDevices.push(v.path)
        requiredConfirmation = expectedPvCreateConfirmation(v.path)
        commandPreview = buildPvCreatePreview(v.path, !!(p as any).force)
      }
      break
    }
    case 'vgcreate': {
      const v = validateVgCreate(p as any, overview)
      blockers.push(...v.blockers)
      warnings.push(...v.warnings)
      const pvPaths = (p.pvPaths as string[]) ?? []
      impactedDevices.push(...pvPaths)
      const name = String(p.name ?? '')
      requiredConfirmation = expectedVgCreateConfirmation(name)
      commandPreview = buildVgCreatePreview(name, pvPaths)
      break
    }
    case 'lvcreate': {
      const v = validateLvCreate(p as any, overview)
      blockers.push(...v.blockers)
      warnings.push(...v.warnings)
      const vgName = String(p.vgName ?? '')
      const lvName = String(p.name ?? '')
      requiredConfirmation = expectedLvCreateConfirmation(vgName, lvName)
      commandPreview = buildLvCreatePreview(vgName, lvName, Number(p.sizeBytes))
      break
    }
    case 'pvremove': {
      const v = validatePvRemove(p as any, overview)
      blockers.push(...v.blockers)
      const path = String(p.path ?? '')
      impactedDevices.push(path)
      requiredConfirmation = expectedPvRemoveConfirmation(path)
      commandPreview = `pvremove -y -f ${path}`
      break
    }
    case 'vgremove': {
      const v = validateVgRemove(p as any, overview)
      blockers.push(...v.blockers)
      const name = String(p.name ?? '')
      requiredConfirmation = expectedVgRemoveConfirmation(name)
      commandPreview = `vgremove -y -f ${name}`
      break
    }
    case 'lvremove': {
      const v = validateLvRemove(p as any, overview)
      blockers.push(...v.blockers)
      const vgName = String(p.vgName ?? '')
      const lvName = String(p.name ?? '')
      requiredConfirmation = expectedLvRemoveConfirmation(vgName, lvName)
      commandPreview = `lvremove -y -f ${vgName}/${lvName}`
      break
    }
    case 'bind_scst': {
      const sanId = getCurrentSanId()
      const nodeLabel = (sanId && getSanSummary(sanId)?.label) || sanId || 'nœud'
      let index = { names: new Set<string>(), pathToDevices: new Map<string, string[]>() }
      try {
        index = await readScstDeviceIndex(manager)
      } catch { /* empty */ }
      const vgName = String(p.vgName ?? '').trim()
      const lvName = String(p.lvName ?? '').trim()
      const lvRow = overview.lvs.find(l => l.vgName === vgName && l.name === lvName)
      let resolvedBackingPath: string | undefined
      let lvPathPresent: boolean | undefined
      if (lvRow) {
        const candidates = lvRow.pathCandidates?.length
          ? lvRow.pathCandidates
          : buildLvPathCandidates(vgName, lvName)
        const resolved = await resolveBlockDevicePathFromCandidates(manager, candidates)
        resolvedBackingPath = resolved.path
        lvPathPresent = !!resolved.path
      }
      const v = validateBindScst(p as any, overview, index, {
        nodeLabel,
        lvPathPresent,
        resolvedBackingPath,
      })
      blockers.push(...v.blockers)
      warnings.push(...v.warnings)
      const deviceName = String(p.deviceName ?? '')
      requiredConfirmation = expectedBindScstConfirmation(deviceName)
      if (v.lvPath) commandPreview = `DEVICE ${deviceName} vdisk_blockio filename ${v.lvPath}`
      break
    }
  }

  const deduped = [...new Set(blockers)]
  return {
    ok: deduped.length === 0,
    blockers: deduped,
    warnings,
    riskLevel: RISK[req.action],
    requiredConfirmation,
    impactedDevices,
    commandPreview,
  }
}
