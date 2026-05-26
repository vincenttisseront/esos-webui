import type { FsFileioViewModel } from '~/utils/fs-fileio-view'
import type { ProvisioningStepStatus } from '~/utils/lvm-provisioning-chain'

export type FsSummaryStatus = 'ok' | 'attention'

export interface FsSummaryStatusInput {
  fileioView: FsFileioViewModel | null
  fetchError: string | null
  actionableWarnings: string[]
  hasStaleData: boolean
  blockProvisioningComplete?: boolean
  fileioTrackConfigured?: boolean
}

function chainIsComplete(steps: FsFileioViewModel['chain']): boolean {
  const required: Array<ProvisioningStepStatus> = ['created']
  return steps.every(s => required.includes(s.status) || s.status === 'ready' || s.status === 'optional')
}

export function buildFsSummaryStatus(input: FsSummaryStatusInput): FsSummaryStatus {
  const { fileioView, fetchError, actionableWarnings, hasStaleData } = input
  if (fetchError || hasStaleData || actionableWarnings.length > 0) return 'attention'
  if (!fileioView) return 'attention'

  const blockComplete = input.blockProvisioningComplete ?? false
  const fileioConfigured = input.fileioTrackConfigured ?? false
  if (blockComplete && !fileioConfigured) {
    const hasBlockingStep = fileioView.chain.some(s =>
      s.status === 'next' || s.status === 'blocked' || s.status === 'missing',
    )
    if (!hasBlockingStep) return 'ok'
  }

  if (!chainIsComplete(fileioView.chain)) return 'attention'
  const hasNext = fileioView.chain.some(s => s.status === 'next' || s.status === 'missing')
  if (hasNext) return 'attention'
  return 'ok'
}

export function formatScannedAt(scannedAtMs: number | undefined, locale = 'fr-FR'): string {
  if (!scannedAtMs) return '—'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(scannedAtMs))
}
