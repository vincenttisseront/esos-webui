export type MissingToolsControllerVendor = 'dell_perc' | 'lsi_megaraid' | 'unknown'

export type MissingToolsReadinessOk = {
  status: 'ok'
  data: MissingToolsReadiness
}

export type MissingToolsReadinessUnavailable = {
  status: 'unavailable'
  error: { code: string; message: string }
}

export type MissingToolsReadinessResponse =
  | MissingToolsReadinessOk
  | MissingToolsReadinessUnavailable

export type MissingToolsReadiness = {
  sanId: string
  scannedAt: number
  controller: {
    detected: boolean
    vendor: MissingToolsControllerVendor | null
    model: string | null
    pciAddress: string | null
    managementMode: 'full' | 'read_only_limited' | 'unavailable' | null
  }
  tools: {
    perccli: boolean
    perccli64: boolean
    storcli: boolean
    storcli64: boolean
    resolvedPath: string | null
    version: string | null
  }
  recommendation: {
    action: 'none' | 'install_perccli64'
    reason: string
    packageKind: 'perccli_rpm' | null
  }
}

export type MissingToolsOperationStatus = 'planned' | 'running' | 'success' | 'failed' | 'cancelled'
export type MissingToolsOperationPhase = 'temp_install' | 'persist' | 'validate'

export type MissingToolsOperationStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export type MissingToolsOperationStep = {
  id: string
  label: string
  command: string
  status: MissingToolsOperationStepStatus
  stdoutPreview: string
  stderrPreview: string
  startedAt?: number
  finishedAt?: number
  durationMs?: number
}

export type MissingToolsOperation = {
  id: string
  sanId: string
  kind: 'perccli64_deploy'
  status: MissingToolsOperationStatus
  phase: MissingToolsOperationPhase
  stagingId?: string
  rootPartition?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
  createdBy: string
  steps: MissingToolsOperationStep[]
  error?: string
  recovery?: { backupPath: string; sqshPath: string }
  preflight?: { blockers: string[]; warnings: string[]; planToken: string }
}


