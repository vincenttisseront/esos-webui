import type {
  ClusterLvmNodeResult,
  ClusterLvmPreflightPerNode,
  ClusterLvmPreflightResult,
} from '~/types/lvm'
import { BIND_SCST_BLOCKER_TAG, parseBindScstBlocker } from '~/utils/lvm-bind-scst-blockers'

const CLUSTER_LVM_BLOCKED_SNIPPET = 'clusterExecution'

type ApiErrorLike = {
  statusCode?: number
  status?: number
  statusMessage?: string
  message?: string
  data?: {
    statusCode?: number
    statusMessage?: string
    message?: string
    code?: string
    context?: string
    detail?: string
    preflight?: ClusterLvmPreflightResult
    nodeResults?: ClusterLvmNodeResult[]
  }
} | null | undefined

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export function extractApiErrorDetail(err: ApiErrorLike): string {
  if (!err) return ''
  return (
    err.data?.message
    ?? err.message
    ?? err.data?.statusMessage
    ?? err.statusMessage
    ?? ''
  ).trim()
}

export function formatBindScstPerNodeLines(perNode: ClusterLvmPreflightPerNode[] | undefined, t: TranslateFn): string[] {
  if (!perNode?.length) return []
  return perNode
    .filter(n => !n.ok || n.blockers.length)
    .flatMap(n => {
      if (n.error && !n.blockers.length) {
        return [`${n.label}: ${n.error}`]
      }
      return n.blockers.map(b => {
        const localized = resolveBindScstBlockerMessage(b, t)
        return localized ? `${n.label}: ${localized}` : `${n.label}: ${b}`
      })
    })
}

export function resolveBindScstClusterPreflightError(err: ApiErrorLike, t: TranslateFn): string {
  const status = extractApiStatusCode(err)
  const detail = extractApiErrorDetail(err)
  const preflight = err?.data?.preflight

  if (status === 409) {
    const lines = formatBindScstPerNodeLines(preflight?.perNode, t)
    if (lines.length) return lines.join('\n')
    if (preflight?.blockers?.length) return formatBindScstPreflightBlockers(preflight.blockers, t)
    return detail || t('lvm.wizard.scst_device.error_conflict')
  }

  if (status === 500) {
    const ctx = err?.data?.context
    const internal = t('lvm.wizard.scst_device.error_preflight_internal')
    return ctx ? `${internal} (${ctx})` : internal
  }

  if (preflight && !preflight.ok) {
    const lines = formatBindScstPerNodeLines(preflight.perNode, t)
    if (lines.length) return lines.join('\n')
    if (preflight.blockers.length) return formatBindScstPreflightBlockers(preflight.blockers, t)
  }

  return detail || t('lvm.wizard.scst_device.error_preflight_failed')
}

export function extractApiStatusCode(err: ApiErrorLike): number | undefined {
  if (!err) return undefined
  return err.statusCode ?? err.status ?? err.data?.statusCode
}

export function resolveBindScstBlockerMessage(blocker: string, t: TranslateFn): string | null {
  const parsed = parseBindScstBlocker(blocker)
  if (!parsed) return null
  switch (parsed.kind) {
    case 'device_exists':
      return t('lvm.wizard.scst_device.error_device_exists_on_node', {
        name: parsed.deviceName ?? '',
        node: parsed.nodeLabel ?? '',
      })
    case 'lv_not_found':
      return t('lvm.wizard.scst_device.error_lv_not_found', { path: parsed.lvPath ?? '' })
    case 'lv_path_missing':
      return t('lvm.wizard.scst_device.error_lv_path_missing', {
        path: parsed.lvPath ?? '',
        node: parsed.nodeLabel ?? '',
      })
    case 'lv_path_in_use':
      return t('lvm.wizard.scst_device.error_lv_path_in_use', {
        path: parsed.lvPath ?? '',
        device: parsed.otherDevice ?? '',
        node: parsed.nodeLabel ?? '',
      })
    default:
      return null
  }
}

export function formatBindScstPreflightBlockers(blockers: string[], t: TranslateFn): string {
  return blockers
    .map(b => resolveBindScstBlockerMessage(b, t) ?? b)
    .join(' · ')
}

export function formatBindScstNodeResults(nodeResults: ClusterLvmNodeResult[] | undefined): string[] {
  if (!nodeResults?.length) return []
  return nodeResults
    .filter(n => n.participation !== 'execute' || n.error)
    .map(n => {
      const detail = n.error ?? n.stderr?.trim() ?? (n.exitCode != null ? `exit ${n.exitCode}` : 'échec')
      return `${n.label}: ${detail}`
    })
}

export function resolveBindScstExecuteError(err: ApiErrorLike, t: TranslateFn): string {
  const detail = extractApiErrorDetail(err)
  const status = extractApiStatusCode(err)
  const code = err?.data?.code
  const nodeLines = formatBindScstNodeResults(err?.data?.nodeResults)

  if (nodeLines.length) return nodeLines.join('\n')

  if (status === 409) {
    if (code === 'lvm.scst_device_conflict' || /existe déjà/i.test(detail)) {
      return [
        t('lvm.wizard.scst_device.error_conflict'),
        t('lvm.wizard.scst_device.error_conflict_hint'),
      ].join(' ')
    }
    if (detail.includes(CLUSTER_LVM_BLOCKED_SNIPPET)) {
      return t('lvm.wizard.scst_device.error_cluster_blocked')
    }
    return detail || t('lvm.wizard.scst_device.error_conflict')
  }

  if (/existe déjà/i.test(detail)) {
    return [
      t('lvm.wizard.scst_device.error_conflict'),
      t('lvm.wizard.scst_device.error_conflict_hint'),
    ].join(' ')
  }

  return detail || t('lvm.wizard.scst_device.error_generic')
}

export function isBindScstStructuredBlocker(line: string): boolean {
  return line.startsWith(`${BIND_SCST_BLOCKER_TAG}:`)
}
