export type MissingToolsPackageStatus = {
  stagingId: string
  sanId: string
  filename: string
  bytesTotal: number
  bytesTransferred: number
  sha256: string
  phase: 'uploading' | 'transferring' | 'ready' | 'error'
  updatedAt: number
  remoteRpmPath?: string
  error?: string
}

const _status = new Map<string, MissingToolsPackageStatus>()

export function setMissingToolsPackageStatus(status: MissingToolsPackageStatus): void {
  _status.set(status.stagingId, status)
  if (status.sanId) {
    for (const [k, v] of _status) {
      if (k !== status.stagingId && v.sanId === status.sanId) _status.delete(k)
    }
  }
}

export function getMissingToolsPackageStatus(stagingId: string): MissingToolsPackageStatus | undefined {
  return _status.get(stagingId)
}

export function getMissingToolsPackageStatusBySan(sanId: string): MissingToolsPackageStatus | undefined {
  for (const v of _status.values()) {
    if (v.sanId === sanId) return v
  }
  return undefined
}

export function deleteMissingToolsPackageStatus(stagingId: string): void {
  _status.delete(stagingId)
}

