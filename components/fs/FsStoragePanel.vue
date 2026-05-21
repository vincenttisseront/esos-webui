<template>
  <div class="space-y-4">
    <StorageReadOnlyBanner :read-only="readOnly" compact />

    <FsSummaryBar
      :counts="summaryCounts"
      :status="summaryStatus"
      :scanned-at-label="scannedAtLabel"
      :next-action-hint="nextActionText || undefined"
      :refreshing="refreshing"
      @refresh="refreshAll"
    />

    <UAlert
      v-if="fs.partialRefresh && partialScannerErrors.length"
      color="amber"
      variant="soft"
      :title="t('storage.fs.refresh.partial_title')"
    >
      <details class="mt-1 text-xs">
        <summary class="cursor-pointer select-none opacity-90">{{ t('storage.fs.refresh.partial_details') }}</summary>
        <ul class="mt-2 list-disc pl-4 space-y-1 font-mono">
          <li v-for="(e, i) in partialScannerErrors" :key="i">
            <span class="font-semibold">{{ e.scanner }}</span>: {{ e.message }}
          </li>
        </ul>
      </details>
    </UAlert>

    <UAlert
      v-if="fs.error"
      color="amber"
      variant="soft"
      :title="t('storage.fs.refresh.incomplete_title')"
      :description="fs.error"
    >
      <details class="mt-1 text-xs opacity-80">
        <summary class="cursor-pointer select-none">{{ t('storage.fs.refresh.technical_details') }}</summary>
        <p class="mt-1 font-mono">{{ fs.lastEndpoint }}</p>
      </details>
    </UAlert>

    <UAlert
      v-else-if="showStaleNotice"
      color="blue"
      variant="soft"
      :title="t('storage.fs.refresh.stale_title')"
      :description="t('storage.fs.refresh.stale_body', { time: scannedAtLabel })"
    />

    <FsProvisioningChain :steps="chainSteps" />

    <div v-if="!readOnly" class="flex flex-wrap gap-2">
      <UButton
        size="sm"
        color="primary"
        icon="i-heroicons-plus"
        :disabled="!eligibleCandidates.length"
        :title="!eligibleCandidates.length ? t('storage.fs.wizard.create_fs.no_backend') : undefined"
        @click="openCreateFsWizard"
      >
        {{ t('storage.fs.actions.create_fs') }}
      </UButton>
      <UButton
        size="sm"
        color="primary"
        variant="soft"
        icon="i-heroicons-document-plus"
        :disabled="!fileioDataMounts.length"
        @click="openCreateVdiskWizard"
      >
        {{ t('storage.fs.actions.create_vdisk') }}
      </UButton>
      <UButton
        size="sm"
        color="primary"
        variant="soft"
        icon="i-heroicons-circle-stack"
        :disabled="!unmappedVdisks.length"
        @click="openFileioWizard"
      >
        {{ t('storage.fs.actions.bind_fileio') }}
      </UButton>
    </div>

    <UCard>
      <template #header>{{ t('storage.fs.overview.fileio_title') }}</template>
      <UTable v-if="fileioDevices.length" :data="fileioDevices" :columns="fileioCols">
        <template #name-cell="{ row }">
          <button
            type="button"
            class="font-mono text-xs text-primary-600 hover:underline"
            @click="highlightLunsForDevice(row.original.name)"
          >
            {{ row.original.name }}
          </button>
        </template>
        <template #filename-cell="{ row }">
          <button
            v-if="row.original.filename"
            type="button"
            class="font-mono text-xs break-all text-primary-600 hover:underline text-left"
            @click="highlightVdiskPath(row.original.filename)"
          >
            {{ row.original.filename }}
          </button>
          <span v-else class="text-gray-400">—</span>
        </template>
        <template #nv_cache-cell="{ row }">
          {{ row.original.attrs.nv_cache ?? '—' }}
        </template>
        <template #mapped-cell="{ row }">
          <UBadge
            :color="row.original.mapped ? 'green' : 'gray'"
            size="xs"
            :label="row.original.mapped ? t('storage.fs.table.mapped') : t('storage.fs.table.unmapped')"
          />
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_fileio') }}</p>
    </UCard>

    <UCard>
      <template #header>
        <span>{{ t('storage.fs.overview.luns_title') }}</span>
        <span v-if="lunFilterDevice" class="text-xs text-gray-500 ml-2">({{ lunFilterDevice }})</span>
      </template>
      <UTable v-if="displayedLuns.length" :data="displayedLuns" :columns="lunCols">
        <template #targetName-cell="{ row }">
          <span class="font-mono text-xs">{{ row.original.targetName }}</span>
        </template>
        <template #groupName-cell="{ row }">
          <span class="text-xs">{{ row.original.groupName || '—' }}</span>
        </template>
        <template #filename-cell="{ row }">
          <button
            v-if="row.original.filename"
            type="button"
            class="font-mono text-xs break-all text-primary-600 hover:underline"
            @click="highlightVdiskPath(row.original.filename)"
          >
            {{ row.original.filename }}
          </button>
          <span v-else>—</span>
        </template>
        <template #readOnly-cell="{ row }">
          <UBadge v-if="row.original.readOnly" color="amber" size="xs" :label="t('storage.targets.detail.readOnlyBadge')" />
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_luns') }}</p>
      <UButton v-if="lunFilterDevice" size="xs" variant="ghost" class="mt-2" @click="lunFilterDevice = null">
        {{ t('storage.fs.wizard.cancel') }}
      </UButton>
    </UCard>

    <UCard>
      <template #header>
        <span>{{ t('storage.fs.overview.vdisks_title') }}</span>
        <span v-if="vdiskFilterMount" class="text-xs text-gray-500 ml-2">{{ vdiskFilterMount }}</span>
      </template>
      <UTable v-if="displayedVdisks.length" :data="displayedVdisks" :columns="vdiskCols">
        <template #path-cell="{ row }">
          <span class="font-mono text-xs break-all">{{ row.original.path }}</span>
        </template>
        <template #size-cell="{ row }">{{ formatBytes(row.original.sizeBytes) }}</template>
        <template #mapped-cell="{ row }">
          <UBadge
            :color="row.original.mapped ? 'green' : 'gray'"
            size="xs"
            :label="row.original.mapped ? t('storage.fs.table.mapped') : t('storage.fs.table.unmapped')"
          />
        </template>
        <template #actions-cell="{ row }">
          <div v-if="!readOnly" class="flex gap-1">
            <UButton
              v-if="!row.original.mapped"
              size="xs"
              color="primary"
              variant="ghost"
              @click="openFileioWizardFor(row.original)"
            >
              {{ t('storage.fs.actions.bind_fileio') }}
            </UButton>
            <UButton
              v-if="!row.original.mapped"
              size="xs"
              color="red"
              variant="ghost"
              @click="confirmDeleteVdisk(row.original.path)"
            >
              {{ t('storage.fs.actions.delete_vdisk') }}
            </UButton>
          </div>
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_vdisks') }}</p>
      <UButton v-if="vdiskFilterMount" size="xs" variant="ghost" class="mt-2" @click="vdiskFilterMount = null">
        {{ t('storage.fs.wizard.cancel') }}
      </UButton>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span>{{ t('storage.fs.overview.mounts_title') }}</span>
          <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input v-model="showSystemMounts" type="checkbox" class="accent-primary-500" />
            {{ t('storage.fs.overview.show_system_mounts') }}
          </label>
        </div>
      </template>
      <UTable v-if="displayedMounts.length" :data="displayedMounts" :columns="mountCols">
        <template #mountPoint-cell="{ row }">
          <button
            type="button"
            class="font-mono text-xs text-primary-600 hover:underline"
            @click="vdiskFilterMount = row.original.mountPoint"
          >
            {{ row.original.mountPoint }}
          </button>
          <UBadge v-if="row.original.role" size="xs" variant="soft" class="ml-1" :label="roleLabel(row.original.role)" />
        </template>
        <template #backingDevice-cell="{ row }">
          <button
            type="button"
            class="font-mono text-xs text-primary-600 hover:underline"
            @click="emit('navigate-block-devices', row.original.linkedBackendPath ?? row.original.backingDevice)"
          >
            {{ row.original.backingDevice }}
          </button>
        </template>
        <template #health-cell="{ row }">
          <UBadge v-if="row.original.health" :color="healthColor(row.original.health)" size="xs" :label="row.original.health" />
        </template>
        <template #size-cell="{ row }">
          {{ formatBytes(row.original.totalBytes) }} / {{ formatBytes(row.original.freeBytes) }} free
        </template>
        <template #actions-cell="{ row }">
          <UButton
            v-if="!readOnly && row.original.role === 'fileio_data'"
            size="xs"
            color="red"
            variant="ghost"
            @click="confirmUnmount(row.original.mountPoint)"
          >
            {{ t('storage.fs.actions.unmount') }}
          </UButton>
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_mounts') }}</p>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span>{{ t('storage.fs.overview.backends_all_title') }}</span>
          <UButton size="xs" variant="ghost" @click="emit('navigate-block-devices')">
            Block Devices
          </UButton>
        </div>
      </template>
      <UTable v-if="backends.length" :data="backends" :columns="backendCols">
        <template #path-cell="{ row }">
          <button
            type="button"
            class="font-mono text-xs text-primary-600 hover:underline"
            @click="emit('navigate-block-devices', row.original.path)"
          >
            {{ row.original.path }}
          </button>
        </template>
        <template #eligible-cell="{ row }">
          <UBadge :color="row.original.eligible ? 'green' : 'gray'" size="xs" :label="row.original.eligible ? 'OK' : '—'" />
        </template>
        <template #reasons-cell="{ row }">
          <span v-if="row.original.eligible" class="text-green-600 text-xs">OK</span>
          <span v-else class="text-red-600 text-xs">{{ formatBackendReasons(row.original.reasons) }}</span>
        </template>
        <template #hw-cell="{ row }">
          <span v-if="row.original.controllerLabel" class="text-xs">{{ row.original.controllerLabel }} / {{ row.original.hwLdId ?? '—' }}</span>
          <span v-else class="text-gray-400">—</span>
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_candidates') }}</p>

      <details
        v-if="!eligibleCandidates.length && backends.length"
        class="mt-3 rounded border border-amber-200 dark:border-amber-800/50 px-3 py-2"
      >
        <summary class="text-xs font-medium text-amber-800 dark:text-amber-200 cursor-pointer select-none">
          {{ t('storage.fs.overview.candidates_title') }}
        </summary>
        <p class="text-xs text-amber-700 dark:text-amber-300 mt-2">{{ noEligibleSummary }}</p>
      </details>
    </UCard>

    <details v-if="actionableScanWarnings.length" class="rounded-lg border border-amber-200 dark:border-amber-800/50 px-3 py-2">
      <summary class="text-sm font-medium cursor-pointer select-none text-amber-800 dark:text-amber-200">
        {{ t('storage.fs.overview.scan_warnings') }} ({{ actionableScanWarnings.length }})
      </summary>
      <ul class="text-xs list-disc pl-4 mt-2 text-amber-800 dark:text-amber-300">
        <li v-for="(w, i) in actionableScanWarnings" :key="i">{{ w }}</li>
      </ul>
    </details>

    <details class="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
      <summary class="text-sm font-medium cursor-pointer select-none">
        {{ t('storage.fs.help.title') }}
      </summary>
      <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">{{ t('storage.fs.help.body') }}</p>
    </details>

    <details v-if="diagnostics" class="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
      <summary class="text-sm font-medium cursor-pointer select-none">
        {{ t('storage.fs.overview.diagnostics_title') }}
      </summary>
      <pre class="text-[11px] mt-2 overflow-x-auto text-gray-600 dark:text-gray-400">{{ diagnosticsText }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
import { formatBytes } from '~/utils/fs-provisioning-chain'
import { buildFsFileioViewModel } from '~/utils/fs-fileio-view'
import { fileioRelevantMounts } from '~/utils/fs-mount-classifier'
import { filterActionableScanWarnings } from '~/utils/fs-scan-warnings'
import { buildFsSummaryStatus, formatScannedAt } from '~/utils/fs-summary-status'
import { fsTableColumn, fsTableColumnId } from '~/utils/fs-table-columns'
import type { FileioDeviceRef, FileSystemMount, FsBackendRef, FsMountRole, MountHealth, ScstLunMappingRef, VDiskFile } from '~/types/filesystem'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'navigate-block-devices': [path?: string]
}>()

const { t } = useEsosI18n()
const fs = useFsStore()
const toast = useAppToast()
const { open: openModal } = useAppModal()
const refreshing = ref(false)
const showSystemMounts = ref(false)
const lunFilterDevice = ref<string | null>(null)
const vdiskFilterMount = ref<string | null>(null)

onMounted(async () => {
  fs.setSanId(props.sanId)
  if (props.clusterId) fs.setClusterContext(props.clusterId, props.sanId)
  await refreshAll()
})

const fileioView = computed(() => buildFsFileioViewModel(fs.overview))
const chainSteps = computed(() => fileioView.value?.chain ?? [])
const backends = computed(() => fs.backends)
const eligibleCandidates = computed(() => backends.value.filter(c => c.eligible))
const unmappedVdisks = computed(() => fileioView.value?.vdiskFiles.filter(v => !v.mapped) ?? [])
const fileioDevices = computed(() => fileioView.value?.fileioDevices ?? [])
const lunMappings = computed(() => fileioView.value?.lunMappings ?? [])
const summaryCounts = computed(() =>
  fileioView.value?.counts ?? {
    filesystems: 0,
    vdiskFiles: 0,
    fileioDevices: 0,
    lunMappings: 0,
  },
)
const partialScannerErrors = computed(() =>
  fs.partialErrors.length
    ? fs.partialErrors
    : fs.overview?.errors ?? [],
)

const actionableScanWarnings = computed(() =>
  filterActionableScanWarnings([
    ...(fs.overview?.scanWarnings ?? []),
    ...(fs.overview?.warnings ?? []),
  ]),
)
const diagnostics = computed(() => fs.diagnostics)

const scannedAtLabel = computed(() =>
  formatScannedAt(fs.overview?.scannedAt ?? fs.lastRefresh?.getTime()),
)

const summaryStatus = computed(() =>
  buildFsSummaryStatus({
    fileioView: fileioView.value,
    fetchError: fs.error,
    actionableWarnings: actionableScanWarnings.value,
    hasStaleData: fs.hasStaleData || fs.partialRefresh,
  }),
)

const showStaleNotice = computed(() => fs.hasStaleData && !fs.error && !!fs.overview)

const fileioDataMounts = computed(() => fileioRelevantMounts(fs.mounts))

const displayedMounts = computed(() => {
  const list = fs.mounts
  if (showSystemMounts.value) return list
  return list.filter(m => m.role !== 'system')
})

const displayedLuns = computed(() => {
  if (!lunFilterDevice.value) return lunMappings.value
  return lunMappings.value.filter(l => l.deviceName === lunFilterDevice.value)
})

const displayedVdisks = computed(() => {
  const list = fileioView.value?.vdiskFiles ?? []
  if (!vdiskFilterMount.value) return list
  return list.filter(v => v.mountPoint === vdiskFilterMount.value)
})

const noEligibleSummary = computed(() => {
  const d = diagnostics.value?.candidates
  return t('storage.fs.overview.no_eligible_summary', {
    total: d?.total ?? backends.value.length,
    eligible: d?.eligible ?? eligibleCandidates.value.length,
  })
})

const diagnosticsText = computed(() => {
  if (!diagnostics.value) return ''
  return JSON.stringify(diagnostics.value, null, 2)
})

const nextActionText = computed(() => {
  const action = fs.overview?.nextAction
  if (!action?.messageKey || action.kind === 'none') return ''
  return t(action.messageKey, action.messageParams ?? {}) as string
})

const mountCols = [
  fsTableColumn<FileSystemMount>('mountPoint', t('storage.fs.table.mount_point')),
  fsTableColumn<FileSystemMount>('backingDevice', t('storage.fs.table.backing')),
  fsTableColumn<FileSystemMount>('fsType', t('storage.fs.table.type')),
  fsTableColumnId<FileSystemMount>('health', ''),
  fsTableColumnId<FileSystemMount>('size', t('storage.fs.table.size')),
  fsTableColumnId<FileSystemMount>('actions', ''),
]
const backendCols = [
  fsTableColumn<FsBackendRef>('path', t('storage.fs.table.path')),
  fsTableColumn<FsBackendRef>('kind', t('storage.fs.table.type')),
  fsTableColumnId<FsBackendRef>('eligible', ''),
  fsTableColumnId<FsBackendRef>('reasons', ''),
  fsTableColumnId<FsBackendRef>('hw', 'HW RAID'),
]
const vdiskCols = [
  fsTableColumn<VDiskFile>('path', t('storage.fs.table.path')),
  fsTableColumnId<VDiskFile>('size', t('storage.fs.table.size')),
  fsTableColumn<VDiskFile>('mapped', t('storage.fs.table.scst')),
  fsTableColumnId<VDiskFile>('actions', ''),
]
const fileioCols = [
  fsTableColumn<FileioDeviceRef>('name', t('storage.fs.table.device')),
  fsTableColumn<FileioDeviceRef>('filename', t('storage.fs.table.filename')),
  fsTableColumnId<FileioDeviceRef>('nv_cache', t('storage.fs.table.nv_cache')),
  fsTableColumn<FileioDeviceRef>('mapped', t('storage.fs.table.scst')),
]
const lunCols = [
  fsTableColumn<ScstLunMappingRef>('targetName', t('storage.fs.table.target')),
  fsTableColumn<ScstLunMappingRef>('groupName', t('storage.fs.table.group')),
  fsTableColumn<ScstLunMappingRef>('lunId', t('storage.fs.table.lun')),
  fsTableColumn<ScstLunMappingRef>('deviceName', t('storage.fs.table.device')),
  fsTableColumn<ScstLunMappingRef>('handler', t('storage.fs.table.handler')),
  fsTableColumn<ScstLunMappingRef>('filename', t('storage.fs.table.filename')),
  fsTableColumnId<ScstLunMappingRef>('readOnly', ''),
]

function roleLabel(role: FsMountRole | undefined) {
  if (role === 'system') return t('storage.fs.overview.role_system')
  if (role === 'fileio_data') return t('storage.fs.overview.role_fileio')
  return role ?? ''
}

function healthColor(h: MountHealth) {
  if (h === 'full') return 'red'
  if (h === 'degraded') return 'amber'
  return 'green'
}

function formatBackendReasons(reasons: string[]): string {
  if (!reasons.length) return '—'
  return reasons
    .map((r) => (r.startsWith('storage.') ? (t(r) as string) : r))
    .join(' · ')
}

function highlightLunsForDevice(name: string) {
  lunFilterDevice.value = name
}

function highlightVdiskPath(path: string) {
  const mp = fs.mounts.find(m => path.startsWith(`${m.mountPoint}/`))?.mountPoint
  if (mp) vdiskFilterMount.value = mp
}

function wizardProps(extra: Record<string, unknown> = {}) {
  return {
    sanId: props.sanId,
    clusterId: props.clusterId,
    isClustered: props.isClustered,
    persistent: true,
    ...extra,
  }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await fs.fetchOverview(true)
  } finally {
    refreshing.value = false
  }
}

async function openCreateFsWizard() {
  const { default: Wizard } = await import('~/components/fs/CreateFilesystemWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: wizardProps({ candidates: eligibleCandidates.value }),
    })
    await refreshAll()
  } catch { /* dismissed */ }
}

async function openCreateVdiskWizard() {
  const { default: Wizard } = await import('~/components/fs/CreateVdiskWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: wizardProps({ mounts: fileioDataMounts.value }),
    })
    await refreshAll()
  } catch { /* dismissed */ }
}

async function openFileioWizard(vdisks = unmappedVdisks.value) {
  const { default: Wizard } = await import('~/components/fs/CreateFileioWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: wizardProps({ vdisks }),
    })
    await refreshAll()
  } catch { /* dismissed */ }
}

function openFileioWizardFor(row: VDiskFile) {
  openFileioWizard([row])
}

async function confirmDeleteVdisk(path: string) {
  const pre = await fs.preflight('delete_vdisk', { path })
  const ok = await modalDestructive({
    title: t('storage.fs.actions.delete_vdisk'),
    message: path,
    inputConfirm: pre.requiredConfirmation,
  })
  if (!ok) return
  await fs.deleteVdisk(path, pre.requiredConfirmation ?? '')
  toast.success(t('storage.fs.wizard.delete_vdisk.success'))
  await refreshAll()
}

async function confirmUnmount(mountPoint: string) {
  const pre = await fs.preflight('unmount', { mountPoint })
  const ok = await modalDestructive({
    title: t('storage.fs.actions.unmount'),
    message: mountPoint,
    inputConfirm: pre.requiredConfirmation,
  })
  if (!ok) return
  await fs.unmount(mountPoint, pre.requiredConfirmation ?? '')
  toast.success(t('storage.fs.wizard.unmount.success'))
  await refreshAll()
}
</script>
