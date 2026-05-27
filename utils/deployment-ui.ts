import type { DeploymentBinaryDto, DeploymentTargetStatus } from '~/types/deployment'

export function formatDeploymentBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 ** 2)).toFixed(1)} MiB`
}

export function deploymentTargetBadgeColor(
  status: DeploymentTargetStatus | string,
): 'gray' | 'blue' | 'amber' | 'green' | 'red' {
  switch (status) {
    case 'success': return 'green'
    case 'failed': return 'red'
    case 'uploading':
    case 'applying': return 'blue'
    default: return 'gray'
  }
}

export function isDeploymentJobRunning(status: string): boolean {
  return status === 'pending' || status === 'running'
}

export function isBinaryDeployable(binary: DeploymentBinaryDto): boolean {
  if (binary.status === 'missing' || binary.status === 'disabled') return false
  return binary.status === 'available' || binary.status === 'registered'
}
