import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDB } from '../index'
import {
  deploymentBinaries,
  deploymentJobs,
  deploymentJobTargets,
} from '../schema'
import type {
  DeploymentBinaryDto,
  DeploymentBinaryKind,
  DeploymentInstallSpec,
  DeploymentJobDto,
  DeploymentJobScope,
  DeploymentJobStatus,
  DeploymentTargetStatus,
  SanLatestDeploymentDto,
} from '~/types/deployment'

function parseInstallSpec(json: string): DeploymentInstallSpec {
  try {
    return JSON.parse(json) as DeploymentInstallSpec
  } catch {
    return {}
  }
}

function rowToBinary(row: typeof deploymentBinaries.$inferSelect): DeploymentBinaryDto {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    filename: row.filename,
    sourcePath: row.sourcePath,
    storedPath: row.storedPath,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    kind: row.kind as DeploymentBinaryKind,
    installSpec: parseInstallSpec(row.installSpecJson),
    status: row.status as DeploymentBinaryDto['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listDeploymentBinaries(): DeploymentBinaryDto[] {
  const db = getDB()
  const rows = db.select().from(deploymentBinaries).all()
  return rows.map(rowToBinary)
}

export function getDeploymentBinaryById(id: string): DeploymentBinaryDto | null {
  const db = getDB()
  const row = db.select().from(deploymentBinaries).where(eq(deploymentBinaries.id, id)).get()
  return row ? rowToBinary(row) : null
}

export function getBinaryBySha256(sha256: string): DeploymentBinaryDto | null {
  const db = getDB()
  const row = db.select().from(deploymentBinaries).where(eq(deploymentBinaries.sha256, sha256)).get()
  return row ? rowToBinary(row) : null
}

export function insertDeploymentBinary(params: {
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
}): DeploymentBinaryDto {
  const db = getDB()
  const now = new Date().toISOString()
  db.insert(deploymentBinaries).values({
    id: params.id,
    name: params.name,
    version: params.version,
    filename: params.filename,
    sourcePath: params.sourcePath,
    storedPath: params.storedPath,
    sizeBytes: params.sizeBytes,
    sha256: params.sha256,
    kind: params.kind,
    installSpecJson: JSON.stringify(params.installSpec),
    status: 'registered',
    createdAt: now,
    updatedAt: now,
  }).run()
  return getDeploymentBinaryById(params.id)!
}

export function createDeploymentJob(params: {
  binaryId: string
  requestedBy: string
  sanIds: string[]
  scope?: DeploymentJobScope
}): DeploymentJobDto {
  const db = getDB()
  const jobId = randomUUID()
  const now = new Date().toISOString()
  const scope = params.scope ?? (params.sanIds.length === 1 ? 'single_san' : 'multi_san')

  db.insert(deploymentJobs).values({
    id: jobId,
    binaryId: params.binaryId,
    scope,
    requestedBy: params.requestedBy,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }).run()

  for (const sanId of params.sanIds) {
    db.insert(deploymentJobTargets).values({
      id: randomUUID(),
      jobId,
      sanId,
      status: 'pending',
      logs: '',
    }).run()
  }

  return getDeploymentJobById(jobId)!
}

export function updateJobStatus(jobId: string, status: DeploymentJobStatus): void {
  const db = getDB()
  db.update(deploymentJobs)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(deploymentJobs.id, jobId))
    .run()
}

export function updateJobTarget(
  targetId: string,
  patch: Partial<{
    status: DeploymentTargetStatus
    remotePath: string | null
    logs: string
    errorMessage: string | null
    startedAt: string | null
    finishedAt: string | null
  }>,
): void {
  const db = getDB()
  const values: Record<string, unknown> = {}
  if (patch.status !== undefined) values.status = patch.status
  if (patch.remotePath !== undefined) values.remotePath = patch.remotePath
  if (patch.logs !== undefined) values.logs = patch.logs
  if (patch.errorMessage !== undefined) values.errorMessage = patch.errorMessage
  if (patch.startedAt !== undefined) values.startedAt = patch.startedAt
  if (patch.finishedAt !== undefined) values.finishedAt = patch.finishedAt
  db.update(deploymentJobTargets).set(values).where(eq(deploymentJobTargets.id, targetId)).run()
}

export function appendJobTargetLog(targetId: string, line: string): void {
  const db = getDB()
  const row = db.select().from(deploymentJobTargets).where(eq(deploymentJobTargets.id, targetId)).get()
  if (!row) return
  const logs = row.logs ? `${row.logs}\n${line}` : line
  db.update(deploymentJobTargets).set({ logs }).where(eq(deploymentJobTargets.id, targetId)).run()
}

export function getDeploymentJobById(jobId: string): DeploymentJobDto | null {
  const db = getDB()
  const job = db.select().from(deploymentJobs).where(eq(deploymentJobs.id, jobId)).get()
  if (!job) return null
  const targets = db.select().from(deploymentJobTargets).where(eq(deploymentJobTargets.jobId, jobId)).all()
  return {
    id: job.id,
    binaryId: job.binaryId,
    scope: (job.scope ?? 'multi_san') as DeploymentJobScope,
    requestedBy: job.requestedBy,
    status: job.status as DeploymentJobStatus,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    targets: targets.map(t => ({
      id: t.id,
      sanId: t.sanId,
      status: t.status as DeploymentTargetStatus,
      remotePath: t.remotePath,
      logs: t.logs,
      errorMessage: t.errorMessage,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
    })),
  }
}

export function listRecentJobsForBinary(binaryId: string, limit = 10): DeploymentJobDto[] {
  const db = getDB()
  const jobs = db.select().from(deploymentJobs).where(eq(deploymentJobs.binaryId, binaryId)).all()
  return jobs
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(j => getDeploymentJobById(j.id)!)
    .filter(Boolean)
}

export function getFailedTargetsForJob(jobId: string) {
  const job = getDeploymentJobById(jobId)
  if (!job) return []
  return job.targets.filter(t => t.status === 'failed')
}

export function getLatestDeploymentForSan(sanId: string): SanLatestDeploymentDto {
  const db = getDB()
  const targets = db.select().from(deploymentJobTargets)
    .where(eq(deploymentJobTargets.sanId, sanId))
    .all()
  if (!targets.length) return null

  const jobs = db.select().from(deploymentJobs).all()
  const jobIdsForSan = new Set(targets.map(t => t.jobId))
  const sorted = jobs
    .filter(j => jobIdsForSan.has(j.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const latestJob = sorted[0]
  if (!latestJob) return null

  const job = getDeploymentJobById(latestJob.id)
  if (!job) return null
  const target = job.targets.find(t => t.sanId === sanId)
  if (!target) return null
  const binary = getDeploymentBinaryById(job.binaryId)
  return { job, target, binary }
}

export function listGlobalDeploymentHistory(limit = 25): DeploymentJobDto[] {
  const db = getDB()
  const jobs = db.select().from(deploymentJobs).all()
  return jobs
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(j => getDeploymentJobById(j.id)!)
    .filter(Boolean)
}

export function getJobTargetForSan(jobId: string, sanId: string) {
  const job = getDeploymentJobById(jobId)
  if (!job) return null
  const target = job.targets.find(t => t.sanId === sanId)
  if (!target) return null
  return { job, target }
}
