import type { ClusterLvmNodeResult } from '~/types/lvm'
import { parseFsFetchError } from '~/utils/fs-wizard-cluster-error'

export type FsWizardExecuteFailure = {
  executeError: string
  clusterNodeResults: ClusterLvmNodeResult[] | null
  isPartialCluster: boolean
}

export function parseFsWizardExecuteFailure(e: unknown, fallbackMessage: string): FsWizardExecuteFailure {
  const { message, nodeResults } = parseFsFetchError(e)
  return {
    executeError: message || fallbackMessage,
    clusterNodeResults: nodeResults,
    isPartialCluster: !!nodeResults?.length,
  }
}
