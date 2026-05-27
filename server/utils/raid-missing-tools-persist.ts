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

export async function runPerccliPersist(params: {
  manager: SSHSessionManager
  sanId: string
  stagingId: string
  remoteRpmPath: string
  rootPartition: string
  createdBy: string
  onUpdate: (op: MissingToolsOperation) => void
}): Promise<MissingToolsOperation> {
  const opId = randomUUID()
  const mnt = '/mnt/esos-root-inject'
  const qMnt = shellSingleQuoteForRemote(mnt)
  const qPart = shellSingleQuoteForRemote(params.rootPartition)

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${mnt}/PRIMARY-root.sqsh.bak.${ts}`
  const workdir = `${mnt}/_work_unsquash_${params.stagingId}`
  const newImg = `${mnt}/PRIMARY-root.sqsh.new`

  const steps: MissingToolsOperationStep[] = [
    step('Mount esos_root (rw)', `mkdir -p ${qMnt} && mount ${qPart} ${qMnt} 2>&1`),
    step('Backup PRIMARY-root.sqsh', `test -f ${qMnt}/PRIMARY-root.sqsh && cp -a ${qMnt}/PRIMARY-root.sqsh ${shellSingleQuoteForRemote(backup)} 2>&1`),
    step('Unsquashfs', `rm -rf ${shellSingleQuoteForRemote(workdir)} 2>/dev/null || true; unsquashfs -f -d ${shellSingleQuoteForRemote(workdir)} ${qMnt}/PRIMARY-root.sqsh 2>&1`),
    step('Extract RPM to temp (inside workdir)', `tmp=${shellSingleQuoteForRemote(`${mnt}/_rpm_${params.stagingId}`)}; rm -rf "$tmp" 2>/dev/null || true; mkdir -p "$tmp"; cd "$tmp" && rpm2cpio ${shellSingleQuoteForRemote(params.remoteRpmPath)} | cpio -idmv 2>&1`),
    step('Inject perccli64 + symlinks into rootfs', [
      `root=${shellSingleQuoteForRemote(workdir)}`,
      `tmp=${shellSingleQuoteForRemote(`${mnt}/_rpm_${params.stagingId}`)}`,
      `p=$(cd "$tmp" && find . -type f -name 'perccli64' 2>/dev/null | head -1)`,
      `test -n "$p"`,
      `mkdir -p "$root/opt/MegaRAID/perccli"`,
      `cp -f "$tmp/$p" "$root/opt/MegaRAID/perccli/perccli64"`,
      `chmod 755 "$root/opt/MegaRAID/perccli/perccli64"`,
      `mkdir -p "$root/usr/local/sbin"`,
      `ln -sf /opt/MegaRAID/perccli/perccli64 "$root/usr/local/sbin/perccli64"`,
      `ln -sf /opt/MegaRAID/perccli/perccli64 "$root/usr/local/sbin/perccli"`,
    ].join('\n')),
    step('Rebuild SquashFS (xz)', `mksquashfs ${shellSingleQuoteForRemote(workdir)} ${shellSingleQuoteForRemote(newImg)} -comp xz -noappend 2>&1`),
    step('Replace PRIMARY-root.sqsh atomically', `mv ${shellSingleQuoteForRemote(newImg)} ${qMnt}/PRIMARY-root.sqsh 2>&1`),
    step('Sync and cleanup', [
      `rm -rf ${shellSingleQuoteForRemote(workdir)} ${shellSingleQuoteForRemote(`${mnt}/_rpm_${params.stagingId}`)} 2>/dev/null || true`,
      'sync 2>/dev/null || true',
      `umount ${qMnt} 2>/dev/null || true`,
    ].join('\n')),
  ]

  let op: MissingToolsOperation = {
    id: opId,
    sanId: params.sanId,
    kind: 'perccli64_deploy',
    status: 'planned',
    phase: 'persist',
    stagingId: params.stagingId,
    rootPartition: params.rootPartition,
    createdAt: Date.now(),
    createdBy: params.createdBy,
    steps,
    recovery: { backupPath: backup, sqshPath: `${mnt}/PRIMARY-root.sqsh` },
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
      const res = await params.manager.exec(s.command, 300_000)
      s.stdoutPreview = clip(res.stdout)
      s.stderrPreview = clip(res.stderr)
      s.finishedAt = Date.now()
      s.durationMs = s.startedAt ? s.finishedAt - s.startedAt : undefined
      if (res.code !== 0) {
        // fallback: if xz rebuild fails, try gzip (once)
        if (s.label === 'Rebuild SquashFS (xz)') {
          const gzipStep: MissingToolsOperationStep = step('Rebuild SquashFS (gzip)', `mksquashfs ${shellSingleQuoteForRemote(workdir)} ${shellSingleQuoteForRemote(newImg)} -comp gzip -noappend 2>&1`)
          gzipStep.status = 'running'
          gzipStep.startedAt = Date.now()
          op.steps.splice(i + 1, 0, gzipStep)
          params.onUpdate(op)
          const gz = await params.manager.exec(gzipStep.command, 300_000)
          gzipStep.stdoutPreview = clip(gz.stdout)
          gzipStep.stderrPreview = clip(gz.stderr)
          gzipStep.finishedAt = Date.now()
          gzipStep.durationMs = gzipStep.startedAt ? gzipStep.finishedAt - gzipStep.startedAt : undefined
          if (gz.code !== 0) {
            gzipStep.status = 'failed'
            s.status = 'failed'
            op.status = 'failed'
            op.error = gzipStep.stderrPreview || gzipStep.stdoutPreview || 'mksquashfs failed'
            op.finishedAt = Date.now()
            params.onUpdate(op)
            return op
          }
          gzipStep.status = 'success'
          s.status = 'failed'
          params.onUpdate(op)
          continue
        }
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

