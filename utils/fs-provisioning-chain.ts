import type { FsNextActionHint, FsOverview } from '~/types/filesystem'
import { pickActiveFileioMount } from '~/utils/fs-active-filesystem'
import { fileioRelevantMounts } from '~/utils/fs-mount-classifier'
import type { FileioInventory } from '~/utils/fs-fileio-inventory'
import { extractFileioInventory } from '~/utils/fs-fileio-inventory'
import {
  activeMountScopedSlices,
  buildExposeStepDetail,
  buildFileioStepDetail,
  buildVdiskStepDetailFromFiles,
  computeFileioChainAggregate,
  exposeStepStatus,
  fileioDeviceMapped,
  fileioStepStatus,
  scopeInventoryToMount,
  vdiskHasFileioDevice,
  vdiskStepStatus,
} from '~/utils/fs-provisioning-chain-aggregate'
import type { ProvisioningStepStatus, ProvisioningStepView } from '~/utils/lvm-provisioning-chain'

export type FsProvisioningStepId = 'filesystem' | 'vdisk' | 'fileio' | 'expose'

const DEFAULT_NEXT: FsNextActionHint = {
  kind: 'create_fs',
  messageKey: 'storage.fs.next.create_fs',
}

export function computeFsNextAction(
  overview: FsOverview,
  options?: { activeMountPoint?: string | null },
): FsNextActionHint {
  const mounts = fileioRelevantMounts(
    overview.mounts.filter(m => m.mounted && m.status === 'mounted'),
  )
  if (!mounts.length) {
    return { kind: 'create_fs', messageKey: 'storage.fs.next.create_fs' }
  }

  const primaryMount = pickActiveFileioMount(overview.mounts, {
    preferredMountPoint: options?.activeMountPoint,
  })
  if (!primaryMount) {
    return { kind: 'create_fs', messageKey: 'storage.fs.next.create_fs' }
  }

  const mp = primaryMount.mountPoint
  const { vdisks, fileioDevices } = activeMountScopedSlices(overview, mp)
  const fileioOnMount = fileioDevices
  const hasFileioPath = fileioOnMount.some(d => d.filename)

  if (!vdisks.length && !hasFileioPath) {
    return {
      kind: 'create_vdisk',
      messageKey: 'storage.fs.next.create_vdisk_in_mount',
      messageParams: { mountPoint: mp },
      mountPoint: mp,
    }
  }

  const unregistered = vdisks.filter(v => !vdiskHasFileioDevice(v, fileioOnMount))
  if (unregistered.length === 1) {
    return {
      kind: 'bind_fileio',
      messageKey: 'storage.fs.next.bind_fileio',
      messageParams: { path: unregistered[0]!.path },
      mountPoint: mp,
    }
  }
  if (unregistered.length > 1) {
    return {
      kind: 'bind_fileio',
      messageKey: 'storage.fs.next.bind_fileio_remaining',
      messageParams: {
        count: String(unregistered.length),
        total: String(vdisks.length),
      },
      mountPoint: mp,
    }
  }

  const unmappedFileio = fileioOnMount.filter(d => !fileioDeviceMapped(d, overview.lunMappings))
  if (unmappedFileio.length === 1) {
    return {
      kind: 'expose',
      messageKey: 'storage.fs.next.expose',
      messageParams: { name: unmappedFileio[0]!.name },
      mountPoint: mp,
    }
  }
  if (unmappedFileio.length > 1) {
    return {
      kind: 'expose',
      messageKey: 'storage.fs.next.expose_remaining',
      messageParams: {
        count: String(unmappedFileio.length),
        total: String(fileioOnMount.length),
      },
      mountPoint: mp,
    }
  }

  const inventory = extractFileioInventory(overview)
  const scoped = scopeInventoryToMount(inventory, mp)
  const fileioLuns = scoped.lunMappings.length > 0
  const anyMapped = fileioOnMount.some(d => d.mapped) || vdisks.some(v => v.mapped)

  if (anyMapped || fileioLuns) {
    return fileioLuns
      ? { kind: 'none', messageKey: 'storage.fs.next.complete' }
      : { kind: 'expose', messageKey: 'storage.fs.next.expose' }
  }

  return { kind: 'none', messageKey: 'storage.fs.next.complete' }
}

function applyStepDetail(
  step: ProvisioningStepView,
  built: { detail: string; detailKey?: string; detailParams?: Record<string, string> },
): void {
  step.detail = built.detail
  step.detailKey = built.detailKey
  step.detailParams = built.detailParams
}

export function buildFsProvisioningSteps(
  overview: FsOverview | null,
  inventory?: FileioInventory,
  options?: { activeMountPoint?: string | null },
): ProvisioningStepView[] {
  if (!overview) {
    return buildFsProvisioningStepsEmpty()
  }

  const inv = inventory ?? extractFileioInventory(overview)
  const activeMount = pickActiveFileioMount(overview.mounts, {
    preferredMountPoint: options?.activeMountPoint,
  })
  const mountPoint = activeMount?.mountPoint ?? options?.activeMountPoint ?? null
  const scoped = mountPoint ? scopeInventoryToMount(inv, mountPoint) : inv
  const agg = computeFileioChainAggregate(inv, mountPoint)

  const dataMounts = fileioRelevantMounts(overview.mounts.filter(m => m.mounted))
  const blockioOnly = !dataMounts.length
    && !scoped.fileioDevices.length
    && inv.backendCandidates.some(b => b.kind === 'lvm_lv')
    && !inv.backendCandidates.some(b => b.eligible)

  const fsStatus: ProvisioningStepStatus = dataMounts.length
    ? 'created'
    : blockioOnly
      ? 'optional'
      : 'missing'

  const vdiskStatus = vdiskStepStatus(agg, dataMounts.length, blockioOnly)
  const fileioStatus = fileioStepStatus(agg, blockioOnly)
  const exposeStatus = exposeStepStatus(agg, blockioOnly)

  const next = computeFsNextAction(overview, { activeMountPoint: options?.activeMountPoint })

  const steps: ProvisioningStepView[] = [
    {
      id: 'filesystem',
      status: fsStatus,
      detail: activeMount?.mountPoint ?? dataMounts[0]?.mountPoint ?? '—',
      hintKey: dataMounts.length
        ? undefined
        : blockioOnly
          ? 'storage.fs.chain.hint.filesystem_optional'
          : 'storage.fs.chain.step.filesystem',
    },
    {
      id: 'vdisk',
      status: vdiskStatus,
      detail: '—',
      count: agg.vdiskTotal || undefined,
      hintKey: next.kind === 'create_vdisk' ? next.messageKey : undefined,
      messageParams: next.messageParams,
    },
    {
      id: 'fileio',
      status: fileioStatus,
      detail: '—',
      count: scoped.fileioDevices.length || undefined,
      hintKey: next.kind === 'bind_fileio' ? next.messageKey : undefined,
      messageParams: next.messageParams,
    },
    {
      id: 'expose',
      status: exposeStatus,
      detail: '—',
      count: agg.lunMappings.length || undefined,
      hintKey: blockioOnly
        ? 'storage.fs.chain.hint.fileio_optional'
        : next.kind === 'expose'
          ? next.messageKey
          : undefined,
      messageParams: next.kind === 'expose' ? next.messageParams : undefined,
    },
  ]

  applyStepDetail(steps[1]!, buildVdiskStepDetailFromFiles(scoped.vdiskFiles, agg))
  applyStepDetail(steps[2]!, buildFileioStepDetail(agg, scoped.vdiskFiles))
  applyStepDetail(steps[3]!, buildExposeStepDetail(agg))

  return steps
}

function buildFsProvisioningStepsEmpty(): ProvisioningStepView[] {
  return [
    { id: 'filesystem', status: 'missing', detail: '—', hintKey: 'storage.fs.chain.step.filesystem' },
    { id: 'vdisk', status: 'missing', detail: '—', detailKey: 'storage.fs.chain.detail.no_vdisk' },
    { id: 'fileio', status: 'missing', detail: '—', detailKey: 'storage.fs.chain.detail.dash' },
    { id: 'expose', status: 'missing', detail: '—', detailKey: 'storage.fs.chain.detail.dash' },
  ]
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`
  return `${(n / 1024 ** 3).toFixed(2)} GiB`
}
