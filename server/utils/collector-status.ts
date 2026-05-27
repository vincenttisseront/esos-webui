import type { CollectorConfig } from './collector-config'

export interface CollectorRunStatus {
  lastRunAt: number | null
  lastError: string | null
  lastSamplesWritten: number
  config: Pick<CollectorConfig, 'enabled' | 'intervalSec' | 'retentionHours'> | null
}

const status: CollectorRunStatus = {
  lastRunAt: null,
  lastError: null,
  lastSamplesWritten: 0,
  config: null,
}

export function recordCollectorSuccess(samplesWritten: number): void {
  status.lastRunAt = Date.now()
  status.lastSamplesWritten = samplesWritten
  status.lastError = null
}

export function recordCollectorError(message: string): void {
  status.lastRunAt = Date.now()
  status.lastError = message
  status.lastSamplesWritten = 0
}

export function setCollectorStatusConfig(
  config: Pick<CollectorConfig, 'enabled' | 'intervalSec' | 'retentionHours'>,
): void {
  status.config = config
}

export function getCollectorRunStatus(): Readonly<CollectorRunStatus> {
  return status
}
