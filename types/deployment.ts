export type DeploymentBinaryKind = 'rpm' | 'executable' | 'archive'

export type DeploymentInstallKind = 'copy_executable' | 'rpm' | 'perccli'

export type DeploymentInstallSpec = {
  installKind?: DeploymentInstallKind
  remotePath?: string
  version?: string
}

export type DeploymentBinaryStatus = 'available' | 'missing' | 'disabled' | 'registered' | 'archived'

export type DeploymentJobScope = 'single_san' | 'multi_san'

export type DeploymentJobStatus = 'pending' | 'running' | 'partial' | 'success' | 'failed'

export type DeploymentTargetStatus =
  | 'pending'
  | 'uploading'
  | 'applying'
  | 'success'
  | 'failed'

export type DeploymentBinaryDto = {
  id: string
  name: string
  version: string | null
  filename: string
  sourcePath: string | null
  storedPath: string
  sizeBytes: number
  sha256: string
  kind: DeploymentBinaryKind
  installSpec: DeploymentInstallSpec
  status: DeploymentBinaryStatus
  createdAt: string
  updatedAt: string
}

export type ContainerBinaryEntry = {
  relativePath: string
  filename: string
  sizeBytes: number
  mtimeMs: number
}

export type ContainerBinaryListItem = ContainerBinaryEntry & {
  sha256: string | null
  registered: boolean
  catalogId: string | null
}

export type DeploymentJobTargetDto = {
  id: string
  sanId: string
  status: DeploymentTargetStatus
  remotePath: string | null
  logs: string
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
}

export type DeploymentJobDto = {
  id: string
  binaryId: string
  scope: DeploymentJobScope
  requestedBy: string
  status: DeploymentJobStatus
  createdAt: string
  updatedAt: string
  targets: DeploymentJobTargetDto[]
}

export type BinariesStorageStatusDto = {
  path: string
  exists: boolean
  writable: boolean
  fileCount: number
  maxBytes: number
  errorCode?: string
  errorMessage?: string
}

/** Latest deployment for one SAN (system config card). */
export type SanLatestDeploymentDto = {
  job: DeploymentJobDto
  target: DeploymentJobTargetDto
  binary: DeploymentBinaryDto | null
} | null
