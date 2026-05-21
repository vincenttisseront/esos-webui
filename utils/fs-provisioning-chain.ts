import type { FileSystemMount, FsOverview, VDiskFile } from '~/types/filesystem'
import type { ProvisioningStepStatus, ProvisioningStepView } from '~/utils/lvm-provisioning-chain'

export type FsProvisioningStepId = 'filesystem' | 'vdisk' | 'fileio' | 'expose'

export function buildFsProvisioningSteps(overview: FsOverview | null): ProvisioningStepView[] {
  const mounts = overview?.mounts ?? []
  const vdisks = overview?.vdiskFiles ?? []
  const mapped = vdisks.filter(v => v.mapped)
  const unmappedVdisk = vdisks.find(v => !v.mapped)

  const fsStatus: ProvisioningStepStatus = mounts.length ? 'created' : 'missing'
  const vdiskStatus: ProvisioningStepStatus = vdisks.length
    ? (unmappedVdisk ? 'next' : 'created')
    : mounts.length
      ? 'next'
      : 'missing'
  const fileioStatus: ProvisioningStepStatus = mapped.length
    ? 'created'
    : unmappedVdisk
      ? 'next'
      : 'missing'
  const exposeStatus: ProvisioningStepStatus = mapped.length ? 'next' : 'missing'

  return [
    {
      id: 'filesystem' as any,
      status: fsStatus,
      detail: mounts[0]?.mountPoint ?? '—',
      count: mounts.length || undefined,
      hintKey: mounts.length ? undefined : 'storage.fs.chain.step.filesystem',
    },
    {
      id: 'vdisk' as any,
      status: vdiskStatus,
      detail: vdisks[0]?.fileName ?? '—',
      count: vdisks.length || undefined,
    },
    {
      id: 'fileio' as any,
      status: fileioStatus,
      detail: mapped[0]?.scstDeviceNames[0] ?? unmappedVdisk?.fileName ?? '—',
      count: mapped.length || undefined,
    },
    {
      id: 'expose' as any,
      status: exposeStatus,
      detail: mapped.length ? 'storage.fs.wizard.fileio.expose_cta' : '—',
    },
  ]
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`
  return `${(n / 1024 ** 3).toFixed(2)} GiB`
}
