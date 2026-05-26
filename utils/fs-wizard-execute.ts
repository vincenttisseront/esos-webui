import type { FileioBindConflict } from '~/types/filesystem'
import type { ClusterLvmNodeResult } from '~/types/lvm'
import { formatFileioBindConflictMessage, parseFileioBindConflictFromError } from '~/utils/fs-fileio-bind-conflict'
import { parseFsFetchError } from '~/utils/fs-wizard-cluster-error'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export type FsWizardExecuteFailure = {
  executeError: string
  clusterNodeResults: ClusterLvmNodeResult[] | null
  isPartialCluster: boolean
  conflict: FileioBindConflict | null
}

export function parseFsWizardExecuteFailure(
  e: unknown,
  fallbackMessage: string,
  t?: TranslateFn,
): FsWizardExecuteFailure {
  const conflict = parseFileioBindConflictFromError(e)
  const { message, nodeResults } = parseFsFetchError(e)
  const executeError = conflict && t
    ? formatFileioBindConflictMessage(conflict, t)
    : message || fallbackMessage
  return {
    executeError,
    clusterNodeResults: nodeResults,
    isPartialCluster: !!nodeResults?.length,
    conflict,
  }
}
