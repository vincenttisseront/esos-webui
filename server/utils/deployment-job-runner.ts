import { randomUUID } from 'node:crypto'
import { getSSHPool } from './ssh-pool'
import { transferLocalFileViaSsh } from './upgrade-package-transfer'
import { shellSingleQuoteForRemote } from './remote-config-paths'
import { assertSanWritable } from './san-request-context'
import type { DeploymentBinaryDto } from '~/types/deployment'
import {
  appendJobTargetLog,
  getDeploymentJobById,
  updateJobStatus,
  updateJobTarget,
} from '../db/repositories/deployment.repository'
import { getDeploymentBinaryById } from '../db/repositories/deployment.repository'

function remoteStagingPath(binary: DeploymentBinaryDto): string {
  return `/tmp/esos-deploy-${randomUUID().slice(0, 8)}-${binary.filename.replace(/[^\w.-]/g, '_')}`
}

async function applyInstall(
  binary: DeploymentBinaryDto,
  remotePath: string,
  manager: Awaited<ReturnType<typeof getSSHPool>['getOrCreate']>,
  log: (line: string) => void,
): Promise<void> {
  const kind = binary.installSpec.installKind ?? (binary.kind === 'rpm' ? 'rpm' : 'copy_executable')
  const qRemote = shellSingleQuoteForRemote(remotePath)

  if (kind === 'perccli' || (kind === 'rpm' && binary.filename.toLowerCase().includes('perccli'))) {
    const workdir = `/tmp/esos-perccli-work-${randomUUID().slice(0, 8)}`
    const qWork = shellSingleQuoteForRemote(workdir)
    const steps = [
      `mkdir -p ${qWork}`,
      `cd ${qWork} && rpm2cpio ${qRemote} | cpio -idmv 2>&1`,
      `cd ${qWork} && p=$(find . -type f -name 'perccli64' 2>/dev/null | head -1); test -n "$p" && mkdir -p /opt/MegaRAID/perccli && cp -f "$p" /opt/MegaRAID/perccli/perccli64 && chmod 755 /opt/MegaRAID/perccli/perccli64`,
      `ln -sf /opt/MegaRAID/perccli/perccli64 /usr/local/sbin/perccli64`,
      `ln -sf /opt/MegaRAID/perccli/perccli64 /usr/local/sbin/perccli`,
    ]
    for (const cmd of steps) {
      log(`$ ${cmd}`)
      const res = await manager.exec(cmd, 120_000)
      if (res.stdout.trim()) log(res.stdout.trim())
      if (res.stderr.trim()) log(res.stderr.trim())
      if (res.code !== 0) throw new Error(res.stderr?.trim() || res.stdout?.trim() || `Échec: ${cmd}`)
    }
    return
  }

  if (kind === 'rpm') {
    const workdir = `/tmp/esos-rpm-work-${randomUUID().slice(0, 8)}`
    const qWork = shellSingleQuoteForRemote(workdir)
    const cmd = `mkdir -p ${qWork} && cd ${qWork} && rpm2cpio ${qRemote} | cpio -idmv 2>&1`
    log(`$ ${cmd}`)
    const res = await manager.exec(cmd, 120_000)
    if (res.stdout.trim()) log(res.stdout.trim())
    if (res.code !== 0) throw new Error(res.stderr?.trim() || 'Extraction RPM échouée')
    return
  }

  const dest = binary.installSpec.remotePath ?? `/usr/local/sbin/${binary.filename}`
  const qDest = shellSingleQuoteForRemote(dest)
  const cmd = `cp -f ${qRemote} ${qDest} && chmod 755 ${qDest}`
  log(`$ ${cmd}`)
  const res = await manager.exec(cmd, 60_000)
  if (res.code !== 0) throw new Error(res.stderr?.trim() || 'Copie échouée')
}

async function runTarget(
  jobId: string,
  targetId: string,
  sanId: string,
  binary: DeploymentBinaryDto,
): Promise<'success' | 'failed'> {
  const startedAt = new Date().toISOString()
  updateJobTarget(targetId, { status: 'uploading', startedAt, errorMessage: null })

  const log = (line: string) => appendJobTargetLog(targetId, line)

  try {
    assertSanWritable(sanId)
    const pool = getSSHPool()
    const manager = await pool.getOrCreate(sanId)
    if (!manager.isReady()) throw new Error('SSH non connecté')

    const remotePath = remoteStagingPath(binary)
    updateJobTarget(targetId, { remotePath })

    log(`Transfert vers ${remotePath}…`)
    await transferLocalFileViaSsh(manager, binary.storedPath, remotePath, {
      onProgress: (done, total) => {
        if (total > 0 && done % (512 * 1024) < 384 * 1024) {
          log(`Transfert ${Math.round((done / total) * 100)}%`)
        }
      },
    })

    const verify = await manager.exec(`sha256sum ${shellSingleQuoteForRemote(remotePath)} 2>/dev/null | awk '{print $1}'`, 30_000)
    const remoteHash = verify.stdout.trim().split(/\s/)[0]
    if (remoteHash && remoteHash !== binary.sha256) {
      throw new Error(`Checksum distant incorrect (attendu ${binary.sha256.slice(0, 12)}…)`)
    }
    log('Checksum distant OK')

    updateJobTarget(targetId, { status: 'applying' })
    log('Application…')
    await applyInstall(binary, remotePath, manager, log)

    updateJobTarget(targetId, {
      status: 'success',
      finishedAt: new Date().toISOString(),
    })
    log('Succès')
    return 'success'
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`Erreur: ${msg}`)
    updateJobTarget(targetId, {
      status: 'failed',
      errorMessage: msg,
      finishedAt: new Date().toISOString(),
    })
    return 'failed'
  }
}

export async function runDeploymentJob(jobId: string): Promise<void> {
  const job = getDeploymentJobById(jobId)
  if (!job) return

  const binary = getDeploymentBinaryById(job.binaryId)
  if (!binary) {
    updateJobStatus(jobId, 'failed')
    return
  }

  updateJobStatus(jobId, 'running')

  const results = await Promise.all(
    job.targets.map(t => runTarget(jobId, t.id, t.sanId, binary)),
  )

  const ok = results.filter(r => r === 'success').length
  const failed = results.filter(r => r === 'failed').length
  if (failed === 0) updateJobStatus(jobId, 'success')
  else if (ok === 0) updateJobStatus(jobId, 'failed')
  else updateJobStatus(jobId, 'partial')
}

export function startDeploymentJobAsync(jobId: string): void {
  void runDeploymentJob(jobId).catch((err) => {
    console.error('[deployment-job]', jobId, err)
    updateJobStatus(jobId, 'failed')
  })
}

export async function retryFailedTargets(jobId: string): Promise<void> {
  const job = getDeploymentJobById(jobId)
  if (!job) throw createError({ statusCode: 404, message: 'Job introuvable' })

  const binary = getDeploymentBinaryById(job.binaryId)
  if (!binary) throw createError({ statusCode: 404, message: 'Binaire introuvable' })

  const failed = job.targets.filter(t => t.status === 'failed')
  if (!failed.length) return

  updateJobStatus(jobId, 'running')
  for (const t of failed) {
    updateJobTarget(t.id, { status: 'pending', errorMessage: null, logs: '', startedAt: null, finishedAt: null })
  }

  const results = await Promise.all(
    failed.map(t => runTarget(jobId, t.id, t.sanId, binary)),
  )

  const refreshed = getDeploymentJobById(jobId)!
  const anyFailed = refreshed.targets.some(t => t.status === 'failed')
  const anyOk = refreshed.targets.some(t => t.status === 'success')
  if (!anyFailed) updateJobStatus(jobId, 'success')
  else if (!anyOk && results.every(r => r === 'failed')) updateJobStatus(jobId, 'failed')
  else updateJobStatus(jobId, 'partial')
}
