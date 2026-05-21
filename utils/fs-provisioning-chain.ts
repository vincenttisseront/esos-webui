import type { FileSystemMount, FsNextActionHint, FsOverview, VDiskFile } from '~/types/filesystem'
import type { ProvisioningStepStatus, ProvisioningStepView } from '~/utils/lvm-provisioning-chain'

export type FsProvisioningStepId = 'filesystem' | 'vdisk' | 'fileio' | 'expose'

const DEFAULT_NEXT: FsNextActionHint = {
  kind: 'create_fs',
  messageKey: 'storage.fs.next.create_fs',
}

export function computeFsNextAction(overview: FsOverview): FsNextActionHint {
  const mounts = overview.mounts.filter(m => m.mounted && m.status === 'mounted')
  if (!mounts.length) {
    return { kind: 'create_fs', messageKey: 'storage.fs.next.create_fs' }
  }

  const primaryMount = pickPrimaryVdiskMount(mounts)
  const vdisksOnMount = overview.vdiskFiles.filter(v => v.mountPoint === primaryMount.mountPoint)
  if (!vdisksOnMount.length) {
    return {
      kind: 'create_vdisk',
      messageKey: 'storage.fs.next.create_vdisk_in_mount',
      messageParams: { mountPoint: primaryMount.mountPoint },
      mountPoint: primaryMount.mountPoint,
    }
  }

  const unmappedFile = vdisksOnMount.find(v => !v.mapped)
  if (unmappedFile) {
    return {
      kind: 'bind_fileio',
      messageKey: 'storage.fs.next.bind_fileio',
      messageParams: { path: unmappedFile.path },
      mountPoint: primaryMount.mountPoint,
    }
  }

  const fileioMapped = overview.fileioDevices.some(d => d.mapped)
  if (fileioMapped || overview.lunMappings.length) {
    return { kind: 'expose', messageKey: 'storage.fs.next.expose' }
  }

  return { kind: 'none', messageKey: 'storage.fs.next.complete' }
}

function pickPrimaryVdiskMount(mounts: FileSystemMount[]): FileSystemMount {
  const underVdisks = mounts.filter(m => m.mountPoint.startsWith('/mnt/vdisks'))
  if (underVdisks.length) {
    return underVdisks.sort((a, b) => a.mountPoint.localeCompare(b.mountPoint))[0]
  }
  return mounts[0]
}

function stepDetailForNextAction(
  overview: FsOverview,
  stepId: FsProvisioningStepId,
): string {
  const mounts = overview.mounts
  const vdisks = overview.vdiskFiles
  const fileio = overview.fileioDevices
  const mappedLuns = overview.lunMappings

  switch (stepId) {
    case 'filesystem':
      return mounts[0]?.mountPoint ?? '—'
    case 'vdisk': {
      const next = overview.nextAction
      if (next.kind === 'create_vdisk' && next.mountPoint) return next.mountPoint
      return vdisks[0]?.fileName ?? vdisks[0]?.path ?? '—'
    }
    case 'fileio':
      return fileio.find(d => d.mapped)?.name
        ?? fileio[0]?.name
        ?? vdisks.find(v => !v.mapped)?.fileName
        ?? '—'
    case 'expose':
      return mappedLuns[0]
        ? `${mappedLuns[0].targetName} LUN ${mappedLuns[0].lunId}`
        : '—'
    default:
      return '—'
  }
}

export function buildFsProvisioningSteps(overview: FsOverview | null): ProvisioningStepView[] {
  if (!overview) {
    return buildFsProvisioningStepsEmpty()
  }

  const mounts = overview.mounts.filter(m => m.mounted)
  const vdisks = overview.vdiskFiles
  const fileioDevices = overview.fileioDevices
  const hasMappedFileio = fileioDevices.some(d => d.mapped) || vdisks.some(v => v.mapped)
  const unmappedVdisk = vdisks.find(v => !v.mapped)
  const unmappedFileio = fileioDevices.find(d => !d.mapped && d.filename)

  const fsStatus: ProvisioningStepStatus = mounts.length ? 'created' : 'missing'
  const vdiskStatus: ProvisioningStepStatus = vdisks.length
    ? (unmappedVdisk ? 'next' : 'created')
    : mounts.length
      ? 'next'
      : 'missing'
  const fileioStatus: ProvisioningStepStatus = fileioDevices.length
    ? (hasMappedFileio && !unmappedFileio ? 'created' : unmappedVdisk || unmappedFileio ? 'next' : 'created')
    : unmappedVdisk
      ? 'next'
      : 'missing'
  const exposeStatus: ProvisioningStepStatus = overview.lunMappings.length
    ? 'created'
    : hasMappedFileio
      ? 'next'
      : 'missing'

  const next = overview.nextAction ?? DEFAULT_NEXT

  return [
    {
      id: 'filesystem',
      status: fsStatus,
      detail: stepDetailForNextAction(overview, 'filesystem'),
      count: mounts.length || undefined,
      hintKey: mounts.length ? undefined : 'storage.fs.chain.step.filesystem',
    },
    {
      id: 'vdisk',
      status: vdiskStatus,
      detail: stepDetailForNextAction(overview, 'vdisk'),
      count: vdisks.length || undefined,
      hintKey: next.kind === 'create_vdisk' ? next.messageKey : undefined,
      messageParams: next.messageParams,
    },
    {
      id: 'fileio',
      status: fileioStatus,
      detail: stepDetailForNextAction(overview, 'fileio'),
      count: fileioDevices.length || undefined,
      hintKey: next.kind === 'bind_fileio' ? next.messageKey : undefined,
      messageParams: next.messageParams,
    },
    {
      id: 'expose',
      status: exposeStatus,
      detail: stepDetailForNextAction(overview, 'expose'),
      count: overview.lunMappings.length || undefined,
      hintKey: next.kind === 'expose' ? next.messageKey : undefined,
    },
  ]
}

function buildFsProvisioningStepsEmpty(): ProvisioningStepView[] {
  return [
    { id: 'filesystem' as any, status: 'missing', detail: '—', hintKey: 'storage.fs.chain.step.filesystem' },
    { id: 'vdisk' as any, status: 'missing', detail: '—' },
    { id: 'fileio' as any, status: 'missing', detail: '—' },
    { id: 'expose' as any, status: 'missing', detail: '—' },
  ]
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`
  return `${(n / 1024 ** 3).toFixed(2)} GiB`
}
