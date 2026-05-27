import { randomUUID } from 'node:crypto'
import type { SSHSessionManager } from './ssh-session-manager'
import { shellSingleQuoteForRemote } from './remote-config-paths'
import type { MissingToolsOperation, MissingToolsOperationStep } from '~/types/missing-tools'

const MAX_PREVIEW = 8_000

function clip(s: string): string {
  const t = (s ?? '').trim()
  if (t.length <= MAX_PREVIEW) return t
  return t.slice(0, MAX_PREVIEW) + `\n... [truncated ${t.length - MAX_PREVIEW} chars]`
}

function step(label: string, command: string): MissingToolsOperationStep {
  return {
    id: randomUUID(),
    label,
    command,
    status: 'pending',
    stdoutPreview: '',
    stderrPreview: '',
  }
}

export async function runPerccliTempInstall(params: {
  manager: SSHSessionManager
  sanId: string
  stagingId: string
  remoteRpmPath: string
  createdBy: string
  onUpdate: (op: MissingToolsOperation) => void
}): Promise<MissingToolsOperation> {
  const opId = randomUUID()
  const workdir = `/tmp/esos-missing-tools-work-${params.stagingId}`
  const qWork = shellSingleQuoteForRemote(workdir)
  const qRpm = shellSingleQuoteForRemote(params.remoteRpmPath)

  const steps: MissingToolsOperationStep[] = [
    step('Create workdir', `mkdir -p ${qWork}`),
    step('Extract RPM (rpm2cpio | cpio)', `cd ${qWork} && rpm2cpio ${qRpm} | cpio -idmv 2>&1`),
    step('Locate perccli64 in extracted tree', `cd ${qWork} && p=$(find . -type f -name 'perccli64' 2>/dev/null | head -1); echo "PERC_PATH=$p"; test -n "$p"`),
    step('Install binary to /opt/MegaRAID/perccli', `cd ${qWork} && p=$(find . -type f -name 'perccli64' 2>/dev/null | head -1); test -n "$p" && mkdir -p /opt/MegaRAID/perccli && cp -f "$p" /opt/MegaRAID/perccli/perccli64 && chmod 755 /opt/MegaRAID/perccli/perccli64`),
    step('Create symlinks in /usr/local/sbin', `ln -sf /opt/MegaRAID/perccli/perccli64 /usr/local/sbin/perccli64 && ln -sf /opt/MegaRAID/perccli/perccli64 /usr/local/sbin/perccli`),
    step('Test perccli64 (read-only)', `/opt/MegaRAID/perccli/perccli64 /call show 2>&1`),
    step('Test perccli64 JSON (read-only)', `/opt/MegaRAID/perccli/perccli64 /call show all J 2>&1 || true`),
  ]

  let op: MissingToolsOperation = {
    id: opId,
    sanId: params.sanId,
    kind: 'perccli64_deploy',
    status: 'planned',
    phase: 'temp_install',
    stagingId: params.stagingId,
    createdAt: Date.now(),
    createdBy: params.createdBy,
    steps,
  }
  params.onUpdate(op)

  op = { ...op, status: 'running', startedAt: Date.now() }
  params.onUpdate(op)

  for (let i = 0; i < steps.length; i++) {
    const s = { ...op.steps[i] }
    s.status = 'running'
    s.startedAt = Date.now()
    op.steps[i] = s
    params.onUpdate(op)

    try {
      const res = await params.manager.exec(s.command, 120_000)
      s.stdoutPreview = clip(res.stdout)
      s.stderrPreview = clip(res.stderr)
      s.finishedAt = Date.now()
      s.durationMs = s.startedAt ? s.finishedAt - s.startedAt : undefined
      if (res.code !== 0) {
        s.status = 'failed'
        op.status = 'failed'
        op.error = s.stderrPreview || s.stdoutPreview || `step failed: ${s.label}`
        op.finishedAt = Date.now()
        params.onUpdate(op)
        return op
      }
      s.status = 'success'
      params.onUpdate(op)
    } catch (err: any) {
      s.stderrPreview = clip(err?.message ?? 'exec error')
      s.status = 'failed'
      s.finishedAt = Date.now()
      op.status = 'failed'
      op.error = s.stderrPreview
      op.finishedAt = Date.now()
      params.onUpdate(op)
      return op
    }
  }

  op.status = 'success'
  op.finishedAt = Date.now()
  params.onUpdate(op)
  return op
}

