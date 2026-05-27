import { getSSHPool } from './ssh-pool'
import { readMissingToolsReadiness } from './raid-missing-tools'
import { listCatalogEnriched } from './deployment-binaries-service'
import { buildSanBinaryDeploymentContext } from '~/utils/binary-deployment-compatibility'
import type { SanBinaryDeploymentContext } from '~/utils/binary-deployment-compatibility'
import type { MissingToolsReadiness } from '~/types/missing-tools'

export async function getSanBinaryDeploymentContext(sanId: string): Promise<{
  context: SanBinaryDeploymentContext
  readinessStatus: 'ok' | 'unavailable'
  readinessError?: { code: string; message: string }
}> {
  const binaries = await listCatalogEnriched()
  let readiness: MissingToolsReadiness | null = null
  let readinessStatus: 'ok' | 'unavailable' = 'unavailable'
  let readinessError: { code: string; message: string } | undefined

  const pool = getSSHPool()
  const manager = pool.get(sanId)
  if (manager) {
    const res = await readMissingToolsReadiness(manager, sanId)
    if (res.status === 'ok') {
      readiness = res.data
      readinessStatus = 'ok'
    } else {
      readinessError = res.error
    }
  } else {
    readinessError = { code: 'SSH_DOWN', message: 'SSH non connecté' }
  }

  const context = buildSanBinaryDeploymentContext({ binaries, readiness })
  return { context, readinessStatus, readinessError }
}
