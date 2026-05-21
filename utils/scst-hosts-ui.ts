import type { ClusterLvmNodeResult } from '~/types/lvm'
import {
  validateGroupName,
  validateInitiatorValue,
  expectedDeleteGroupConfirmation,
  type InitiatorType,
} from '~/utils/scst-initiator-validation'

export function mapHostsValidationError(errorKey?: string, t?: (key: string) => string): string {
  if (!errorKey) return ''
  if (t) {
    const translated = t(errorKey)
    if (translated !== errorKey) return translated
  }
  return errorKey
}

export function previewGroupName(name: string, t?: (key: string) => string) {
  return validateGroupName(name)
    .ok
    ? null
    : mapHostsValidationError(validateGroupName(name).errorKey, t)
}

export function previewInitiator(
  value: string,
  type: InitiatorType,
  t?: (key: string) => string,
) {
  const r = validateInitiatorValue(value, { type: type === 'auto' ? 'auto' : type })
  if (r.ok) return { error: null as string | null, normalized: r.normalized }
  return { error: mapHostsValidationError(r.errorKey, t), normalized: undefined }
}

export { expectedDeleteGroupConfirmation }

export type ScstHostsClusterContext = {
  clusterId: string
  primarySanId: string
}

export function extractNodeResults(err: unknown): ClusterLvmNodeResult[] | null {
  const e = err as { data?: { nodeResults?: ClusterLvmNodeResult[] } }
  return e?.data?.nodeResults ?? null
}
