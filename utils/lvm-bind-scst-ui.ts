import { BIND_SCST_BLOCKER_TAG, parseBindScstBlocker } from '~/utils/lvm-bind-scst-blockers'

const CLUSTER_LVM_BLOCKED_SNIPPET = 'clusterExecution'

type ApiErrorLike = {
  statusCode?: number
  status?: number
  statusMessage?: string
  message?: string
  data?: { statusCode?: number; statusMessage?: string; message?: string; code?: string }
} | null | undefined

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export function extractApiErrorDetail(err: ApiErrorLike): string {
  if (!err) return ''
  return (
    err.data?.statusMessage
    ?? err.statusMessage
    ?? err.data?.message
    ?? err.message
    ?? ''
  ).trim()
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

export function resolveBindScstExecuteError(err: ApiErrorLike, t: TranslateFn): string {
  const detail = extractApiErrorDetail(err)
  const status = extractApiStatusCode(err)
  const code = err?.data?.code

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
