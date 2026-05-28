<template>
  <div class="space-y-4">
    <StorageReadOnlyBanner :read-only="readOnly" compact />

    <UAlert
      v-if="exposure?.blockioOperationalFileioOptional"
      color="blue"
      variant="soft"
      :title="t('storage.exposure.fileio_optional_operational')"
      :description="t('storage.fs.workflow.blockio_exposed.no_fileio_backend_title')"
    />

    <UAlert
      v-for="(issue, idx) in exposure?.issues ?? []"
      :key="idx"
      color="amber"
      variant="soft"
      :title="t(issue.messageKey, issue.messageParams ?? {})"
    />

    <FsSummaryBar
      :counts="summaryCounts"
      :status="summaryStatus"
      :scanned-at-label="scannedAtLabel"
      :next-action-hint="workflowNextHint || undefined"
      :exposure="exposure"
      :refreshing="refreshing"
      @refresh="refreshAll"
    />

    <UAlert
      v-if="pendingHwBackends.length"
      color="amber"
      variant="soft"
      :title="t('storage.fs.pending_hw_backend.title')"
      :description="t('storage.fs.pending_hw_backend.body')"
    >
      <ul class="list-disc pl-4 mt-1 text-xs">
        <li v-for="row in pendingHwBackends" :key="`${row.controllerId}:${row.vdId}`">
          {{ row.controllerLabel }} {{ row.vdId }} ({{ formatBytes(row.sizeBytes) }})
        </li>
      </ul>
      <div class="mt-2 flex flex-wrap gap-2">
        <UButton
          size="xs"
          color="amber"
          variant="soft"
          :loading="rescanningHw"
          :disabled="props.readOnly"
          @click="rescanPendingHwBackends"
        >
          {{ t('storage.fs.pending_hw_backend.action_rescan') }}
        </UButton>
        <UButton size="xs" color="gray" variant="ghost" @click="emit('navigate-block-devices')">
          {{ t('storage.fs.pending_hw_backend.action_devices') }}
        </UButton>
      </div>
    </UAlert>

    <UAlert
      v-if="lastHwRescan?.mappedPath"
      color="green"
      variant="soft"
      :title="t('storage.fs.pending_hw_backend.detected_title', { path: lastHwRescan.mappedPath })"
    >
      <div class="mt-2 flex flex-wrap gap-2">
        <UButton size="xs" color="primary" variant="soft" @click="emit('navigate-lvm')">
          {{ t('storage.fs.pending_hw_backend.action_create_pv') }}
        </UButton>
        <UButton size="xs" color="emerald" variant="soft" @click="openCreateFsWizard">
          {{ t('storage.fs.pending_hw_backend.action_create_fs') }}
        </UButton>
        <UButton size="xs" color="gray" variant="ghost" @click="emit('navigate-block-devices')">
          {{ t('storage.fs.pending_hw_backend.action_devices') }}
        </UButton>
      </div>
    </UAlert>

    <UAlert
      v-else-if="lastHwRescan && !lastHwRescan.mappedPath"
      color="amber"
      variant="soft"
      :title="t('storage.fs.pending_hw_backend.no_device_after_rescan_title')"
    >
      <div class="mt-2 flex flex-wrap gap-2">
        <UButton size="xs" color="gray" variant="soft" @click="emit('navigate-block-devices')">
          {{ t('storage.fs.pending_hw_backend.action_diagnostic') }}
        </UButton>
      </div>
    </UAlert>

    <details
      v-if="lastHwRescan?.diagnostics"
      class="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
    >
      <summary class="text-xs font-medium cursor-pointer select-none">
        {{ t('storage.fs.pending_hw_backend.rescan_details') }}
      </summary>
      <div class="mt-2 text-[11px] space-y-2 font-mono text-gray-600 dark:text-gray-300">
        <p>{{ t('storage.fs.pending_hw_backend.hosts_scanned') }}: {{ (lastHwRescan.diagnostics.megaraidHosts ?? []).join(', ') || 'all' }}</p>
        <p>{{ t('storage.fs.pending_hw_backend.new_lsscsi_entries') }}: {{ (lastHwRescan.diagnostics.newLsscsiEntries ?? []).length }}</p>
        <p>{{ t('storage.fs.pending_hw_backend.new_lsblk_entries') }}: {{ (lastHwRescan.diagnostics.newLsblkEntries ?? []).length }}</p>
        <pre class="bg-gray-50 dark:bg-gray-950 rounded p-2 overflow-x-auto">{{ (lastHwRescan.diagnostics.manualCommands ?? []).join('\n') }}</pre>
        <pre class="bg-gray-50 dark:bg-gray-950 rounded p-2 overflow-x-auto">{{ lastHwRescan.diagnostics.dmesgTail || '—' }}</pre>
      </div>
    </details>

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

    <div
      v-if="fileioDataMounts.length"
      class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 space-y-3"
    >
      <div>
        <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {{ t('storage.fs.active_filesystem.title') }}
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {{ t('storage.fs.active_filesystem.hint') }}
        </p>
      </div>
      <div
        v-if="fileioDataMounts.length > 1"
        class="grid grid-cols-1 sm:grid-cols-2 gap-2"
        role="radiogroup"
        :aria-label="t('storage.fs.active_filesystem.title')"
      >
        <button
          v-for="m in fileioDataMounts"
          :key="m.mountPoint"
          type="button"
          class="rounded-lg border px-3 py-2 text-left text-sm transition-colors"
          :class="m.mountPoint === activeFileioMountPoint
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10 ring-1 ring-primary-500'
            : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'"
          @click="selectActiveFileioMount(m.mountPoint)"
        >
          <span class="block font-mono font-medium">{{ m.mountPoint }}</span>
          <span class="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ t('storage.fs.active_filesystem.free', {
              free: formatBytes(m.freeBytes),
              total: formatBytes(m.totalBytes),
            }) }}
          </span>
        </button>
      </div>
      <p v-else-if="activeFileioMount" class="text-sm font-mono">
        {{ t('storage.fs.active_filesystem.selected', { mount: activeFileioMount.mountPoint }) }}
        <span class="text-gray-500 dark:text-gray-400 text-xs ml-2">
          {{ t('storage.fs.active_filesystem.free', {
            free: formatBytes(activeFileioMount.freeBytes),
            total: formatBytes(activeFileioMount.totalBytes),
          }) }}
        </span>
      </p>
    </div>

    <FsProvisioningChain :steps="chainSteps" />

    <div v-if="!readOnly" class="flex flex-wrap gap-2 items-center">
      <UButton
        v-if="showNextStepButton"
        size="sm"
        color="primary"
        variant="solid"
        icon="i-heroicons-arrow-right-circle"
        @click="runNextStep"
      >
        {{ t('storage.fs.next.action_button') }}
      </UButton>
      <UButton
        size="sm"
        color="primary"
        icon="i-heroicons-plus"
        :disabled="!eligibleCandidates.length"
        :title="createFsButtonTitle"
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
      <UTooltip
        v-if="!eligibleFileioVdisks.length"
        :text="t('storage.fs.actions.bind_fileio_no_eligible')"
      >
        <span class="inline-flex">
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-heroicons-circle-stack"
            disabled
          >
            {{ t('storage.fs.actions.bind_fileio') }}
          </UButton>
        </span>
      </UTooltip>
      <UButton
        v-else
        size="sm"
        color="primary"
        variant="soft"
        icon="i-heroicons-circle-stack"
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
        <template #actions-cell="{ row }">
          <div class="flex flex-wrap gap-2">
            <NuxtLink
              v-if="deviceViewMappingsUrl(row.original.name)"
              :to="deviceViewMappingsUrl(row.original.name)!"
              class="text-xs text-primary-600 hover:underline"
            >
              {{ t('storage.hosts.links.viewMappings') }}
            </NuxtLink>
            <NuxtLink
              v-if="!readOnly && deviceExposeUrl(row.original.name)"
              :to="deviceExposeUrl(row.original.name)!"
              class="text-xs text-primary-600 hover:underline"
            >
              {{ t('storage.hosts.links.exposeToInitiators') }}
            </NuxtLink>
          </div>
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500 dark:text-gray-400">{{ t('storage.fs.overview.empty_fileio') }}</p>
    </UCard>

    <UCard>
      <template #header>
        <span>{{ t('storage.fs.overview.luns_title') }}</span>
        <span v-if="lunFilterDevice" class="text-xs text-gray-500 dark:text-gray-400 ml-2">({{ lunFilterDevice }})</span>
      </template>
      <UTable v-if="displayedLuns.length" :data="displayedLuns" :columns="lunCols">
        <template #targetName-cell="{ row }">
          <NuxtLink
            :to="`/targets/${encodeURIComponent(row.original.targetName)}`"
            class="font-mono text-xs text-primary-600 hover:underline"
          >
            {{ row.original.targetName }}
          </NuxtLink>
        </template>
        <template #groupName-cell="{ row }">
          <span class="text-xs">{{ row.original.groupName || '—' }}</span>
        </template>
        <template #initiators-cell="{ row }">
          <span class="font-mono text-xs break-all">
            {{ row.original.initiators?.length ? row.original.initiators.join(', ') : '—' }}
          </span>
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
      <p v-else class="text-sm text-gray-500 dark:text-gray-400">{{ t('storage.fs.overview.empty_luns') }}</p>
      <UButton v-if="lunFilterDevice" size="xs" variant="ghost" class="mt-2" @click="lunFilterDevice = null">
        {{ t('storage.fs.wizard.cancel') }}
      </UButton>
    </UCard>

    <UCard>
      <template #header>
        <span>{{ t('storage.fs.overview.vdisks_title') }}</span>
        <span v-if="vdiskFilterMount" class="text-xs text-gray-500 dark:text-gray-400 ml-2">{{ vdiskFilterMount }}</span>
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
              v-if="isVdiskEligibleForFileioBindRow(row.original)"
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
      <p v-else class="text-sm text-gray-500 dark:text-gray-400">{{ t('storage.fs.overview.empty_vdisks') }}</p>
      <UButton v-if="vdiskFilterMount" size="xs" variant="ghost" class="mt-2" @click="vdiskFilterMount = null">
        {{ t('storage.fs.wizard.cancel') }}
      </UButton>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <span>{{ t('storage.fs.overview.mounts_title') }}</span>
          <label class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
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
      <p v-else class="text-sm text-gray-500 dark:text-gray-400">{{ t('storage.fs.overview.empty_mounts') }}</p>
    </UCard>

    <FsFileioBackendsPanel
      :backends="backends"
      :blockio-operational-fileio-optional="exposure?.blockioOperationalFileioOptional"
      :blockio-bound-lvs="exposure?.blockio.boundLvs"
      :suggested-lv-name="exposure?.suggestedFileioLvName"
      :suggested-vg-name="exposure?.suggestedFileioVgName"
      :can-create-fileio-lv="canCreateFileioLv"
      @navigate-block-devices="emit('navigate-block-devices', $event)"
      @navigate-lvm="emit('navigate-lvm')"
      @create-fileio-lv="emit('create-fileio-lv', $event)"
    />

    <details v-if="actionableScanWarnings.length" class="rounded-lg border border-amber-200 dark:border-amber-800/50 px-3 py-2">
      <summary class="text-sm font-medium cursor-pointer select-none text-amber-800 dark:text-amber-200">
        {{ t('storage.fs.overview.scan_warnings') }} ({{ actionableScanWarnings.length }})
      </summary>
      <ul class="text-xs list-disc pl-4 mt-2 text-amber-800 dark:text-amber-300">
        <li v-for="(w, i) in actionableScanWarnings" :key="i">{{ w }}</li>
      </ul>
    </details>

    <details
      class="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
      :open="!hasFileioInventory"
    >
      <summary class="text-sm font-medium cursor-pointer select-none">
        {{ t('storage.fs.help.title') }}
      </summary>
      <div class="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-400">
        <p>{{ t('storage.fs.help.intro') }}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div class="rounded border border-gray-100 dark:border-gray-800 p-2">
            <p class="font-medium text-gray-800 dark:text-gray-200">{{ t('storage.fs.help.fileio_label') }}</p>
            <p class="mt-1">{{ t('storage.fs.help.fileio_short') }}</p>
          </div>
          <div class="rounded border border-gray-100 dark:border-gray-800 p-2">
            <p class="font-medium text-gray-800 dark:text-gray-200">{{ t('storage.fs.help.blockio_label') }}</p>
            <p class="mt-1">{{ t('storage.fs.help.blockio_short') }}</p>
          </div>
        </div>
        <p class="text-xs">{{ t('storage.fs.help.body') }}</p>
      </div>
    </details>

    <details v-if="diagnostics" class="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
      <summary class="flex items-center justify-between gap-2 text-sm font-medium cursor-pointer select-none">
        <span>{{ t('storage.fs.overview.diagnostics_title') }}</span>
        <CopyButton
          v-if="diagnosticsText"
          :value="diagnosticsText"
          class="shrink-0"
          @click.stop
        />
      </summary>
      <pre class="text-[11px] mt-2 overflow-x-auto text-gray-600 dark:text-gray-400">{{ diagnosticsText }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
import { formatBytes } from '~/utils/fs-provisioning-chain'
import {
  exposeDeviceUrl,
  findDeviceMappings,
  primaryMappingViewUrl,
} from '~/utils/scst-device-mapping-links'
import { isDeviceMapped } from '~/utils/scst-unmapped-devices'
import { fileioRelevantMounts } from '~/utils/fs-mount-classifier'
import { filterActionableScanWarnings } from '~/utils/fs-scan-warnings'
import { buildFsSummaryStatus, formatScannedAt } from '~/utils/fs-summary-status'
import { analyzeFileioBackendSituation } from '~/utils/storage-workflow-guidance'
import { fsTableColumn, fsTableColumnId } from '~/utils/fs-table-columns'
import {
  eligibleVdisksForFileioBind,
  isVdiskEligibleForFileioBind,
} from '~/utils/fs-fileio-eligible-vdisks'
import type { FileioDeviceRef, FileSystemMount, FsMountRole, MountHealth, ScstLunMappingRef, VDiskFile } from '~/types/filesystem'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  readOnly?: boolean
  startupIntent?: {
    action: 'create-filesystem'
    device?: string | null
    token: string
  } | null
}>()

const emit = defineEmits<{
  'navigate-block-devices': [path?: string]
  'navigate-lvm': []
  'create-fileio-lv': [payload: { lvName: string; vgName?: string }]
  'intent-consumed': [token: string]
}>()

const { t } = useEsosI18n()
const fs = useFsStore()
const lvm = useLvmStore()
const raid = useRaidStore()
const { overview, refresh: refreshOverview } = useOverview()
const toast = useAppToast()
const { open: openModal } = useAppModal()
const refreshing = ref(false)
const showSystemMounts = ref(false)
const lunFilterDevice = ref<string | null>(null)
const vdiskFilterMount = ref<string | null>(null)

onMounted(async () => {
  fs.setSanId(props.sanId)
  lvm.setSanId(props.sanId)
  if (props.clusterId) fs.setClusterContext(props.clusterId, props.sanId)
  await refreshAll()
})

const fileioView = computed(() => fs.fileioView)
const chainSteps = computed(() => fileioView.value?.chain ?? [])
const backends = computed(() => fs.backends)
const pendingHwBackends = computed(() => fs.overview?.pendingHwRaidBackends ?? [])
const rescanningHw = ref(false)
const lastHwRescan = ref<null | Awaited<ReturnType<typeof raid.rescanHardwareScsi>>>(null)
const eligibleCandidates = computed(() => backends.value.filter(c => c.eligible))
const unmappedVdisks = computed(() => fileioView.value?.vdiskFiles.filter(v => !v.mapped) ?? [])
const eligibleFileioVdisks = computed(() =>
  eligibleVdisksForFileioBind(fileioView.value?.vdiskFiles ?? [], fs.overview),
)

function isVdiskEligibleForFileioBindRow(vdisk: VDiskFile) {
  return isVdiskEligibleForFileioBind(vdisk, fs.overview)
}
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

const fileioTrackConfigured = computed(() => {
  const ov = fs.overview
  if (!ov) return false
  return fileioRelevantMounts(ov.mounts.filter(m => m.mounted)).length > 0
    || ov.fileioDevices.length > 0
})

const workflowSituation = computed(() =>
  analyzeFileioBackendSituation({
    backends: backends.value,
    lvs: lvm.lvs,
    vgs: lvm.vgs.map(v => ({ name: v.name, freeBytes: v.freeBytes, clustered: v.clustered })),
    fileioTrackConfigured: fileioTrackConfigured.value,
    overview: fs.overview,
    fileioChain: fileioView.value?.chain ?? [],
  }),
)

const exposure = computed(() => workflowSituation.value.exposure)

const canCreateFileioLv = computed(() =>
  !props.readOnly
  && Boolean(exposure.value?.blockioOperationalFileioOptional)
  && lvm.vgs.some(v => !v.clustered && v.freeBytes > 0),
)

const summaryStatus = computed(() =>
  buildFsSummaryStatus({
    fileioView: fileioView.value,
    fetchError: fs.error,
    actionableWarnings: actionableScanWarnings.value,
    hasStaleData: fs.hasStaleData || fs.partialRefresh,
    exposure: exposure.value,
  }),
)

const showStaleNotice = computed(() => fs.hasStaleData && !fs.error && !!fs.overview)

const fileioDataMounts = computed(() =>
  (fileioView.value?.filesystems ?? []).filter(m => m.mounted && m.status === 'mounted'),
)

const displayedMounts = computed(() => {
  const fileioMounts = fileioView.value?.filesystems ?? []
  if (!showSystemMounts.value) return fileioMounts
  const systemMounts = fs.mounts.filter(m => m.role === 'system')
  return [...fileioMounts, ...systemMounts]
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

const hasFileioInventory = computed(() =>
  summaryCounts.value.filesystems > 0
  || summaryCounts.value.vdiskFiles > 0
  || summaryCounts.value.fileioDevices > 0
  || fileioDataMounts.value.length > 0,
)

const diagnosticsText = computed(() => {
  if (!diagnostics.value) return ''
  return JSON.stringify(diagnostics.value, null, 2)
})

const nextAction = computed(() => fs.effectiveNextAction ?? fs.overview?.nextAction)
const activeFileioMountPoint = computed(() => fs.activeFileioMountPoint)
const activeFileioMount = computed(() => fs.activeFileioMount)

const createFsButtonTitle = computed(() => {
  if (eligibleCandidates.value.length) return undefined
  if (fileioDataMounts.value.length) {
    return t('storage.fs.wizard.create_fs.no_backend_optional') as string
  }
  return t('storage.fs.wizard.create_fs.no_backend') as string
})

function selectActiveFileioMount(mountPoint: string) {
  fs.setActiveFileioMount(mountPoint)
}

const nextActionText = computed(() => {
  const action = nextAction.value
  if (!action?.messageKey || action.kind === 'none') return ''
  return t(action.messageKey, action.messageParams ?? {}) as string
})

const workflowNextHint = computed(() => {
  if (pendingHwBackends.value.length) {
    return t('storage.fs.pending_hw_backend.body') as string
  }
  if (exposure.value?.blockioOperationalFileioOptional) {
    return t('storage.exposure.fileio_optional_operational') as string
  }
  if (exposure.value?.fileio.mode === 'optional') {
    return t('storage.fs.workflow.fileio_optional_hint') as string
  }
  if (
    exposure.value?.blockio.complete
    && !exposure.value?.fileio.started
    && nextAction.value?.kind === 'create_fs'
  ) {
    return ''
  }
  return nextActionText.value
})

const showNextStepButton = computed(() => {
  if (pendingHwBackends.value.length) return false
  if (exposure.value?.blockioOperationalFileioOptional) return false
  const kind = nextAction.value?.kind
  if (kind === 'create_fs' && exposure.value?.blockio.complete && !exposure.value?.fileio.started) {
    return false
  }
  return kind === 'create_fs' || kind === 'create_vdisk' || kind === 'bind_fileio'
})

function runNextStep() {
  const action = nextAction.value
  if (!action) return
  if (action.kind === 'create_fs') {
    void openCreateFsWizard()
  } else if (action.kind === 'create_vdisk') {
    void openCreateVdiskWizard(action.mountPoint)
  } else if (action.kind === 'bind_fileio') {
    const path = action.messageParams?.path
    const list = path
      ? eligibleFileioVdisks.value.filter(v => v.path === path)
      : eligibleFileioVdisks.value
    void openFileioWizard(list.length ? list : eligibleFileioVdisks.value, path)
  }
}

async function rescanPendingHwBackends() {
  if (rescanningHw.value || !pendingHwBackends.value.length) return
  rescanningHw.value = true
  try {
    const target = pendingHwBackends.value[0]
    const result = await raid.rescanHardwareScsi({
      controllerId: target?.controllerId,
      vdId: target?.vdId,
    })
    lastHwRescan.value = result
    await Promise.all([refreshAll(), lvm.fetchOverview(true)])
    if (result.mappedPath) {
      toast.success(t('storage.fs.pending_hw_backend.detected_title', { path: result.mappedPath }) as string)
    } else {
      toast.warning(t('storage.fs.pending_hw_backend.no_device_after_rescan_title') as string)
    }
  } catch (err: any) {
    toast.error(err?.data?.statusMessage ?? err?.message ?? String(t('storage.fs.pending_hw_backend.rescan_failed')))
  } finally {
    rescanningHw.value = false
  }
}

const mountCols = [
  fsTableColumn<FileSystemMount>('mountPoint', t('storage.fs.table.mount_point')),
  fsTableColumn<FileSystemMount>('backingDevice', t('storage.fs.table.backing')),
  fsTableColumn<FileSystemMount>('fsType', t('storage.fs.table.type')),
  fsTableColumnId<FileSystemMount>('health', ''),
  fsTableColumnId<FileSystemMount>('size', t('storage.fs.table.size')),
  fsTableColumnId<FileSystemMount>('actions', ''),
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
  fsTableColumnId<FileioDeviceRef>('actions', ''),
]

function deviceViewMappingsUrl(deviceName: string): string | null {
  if (!overview.value) return null
  return primaryMappingViewUrl(findDeviceMappings(overview.value, deviceName))
}

function deviceExposeUrl(deviceName: string): string | null {
  if (!overview.value || isDeviceMapped(overview.value, deviceName)) return null
  return exposeDeviceUrl(overview.value, deviceName)
}
const lunCols = [
  fsTableColumn<ScstLunMappingRef>('targetName', t('storage.fs.table.target')),
  fsTableColumn<ScstLunMappingRef>('groupName', t('storage.fs.table.group')),
  fsTableColumnId<ScstLunMappingRef>('initiators', t('storage.fs.table.initiators')),
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
    await Promise.all([
      fs.fetchOverview(true),
      refreshOverview(),
      lvm.fetchOverview(true).catch(() => undefined),
    ])
  } finally {
    refreshing.value = false
  }
}

async function openCreateFsWizard(initialBackendPath?: string) {
  const { default: Wizard } = await import('~/components/fs/CreateFilesystemWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: wizardProps({ candidates: eligibleCandidates.value, initialBackendPath }),
    })
    await refreshAll()
  } catch { /* dismissed */ }
}

async function openCreateVdiskWizard(initialMountPoint?: string) {
  const { default: Wizard } = await import('~/components/fs/CreateVdiskWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: wizardProps({
        mounts: fileioDataMounts.value,
        initialMountPoint: initialMountPoint ?? activeFileioMountPoint.value ?? undefined,
      }),
    })
    await refreshAll()
  } catch { /* dismissed */ }
}

async function openFileioWizard(vdisks = eligibleFileioVdisks.value, initialVdiskPath?: string) {
  const { default: Wizard } = await import('~/components/fs/CreateFileioWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: wizardProps({
        vdisks: fileioView.value?.vdiskFiles ?? vdisks,
        initialVdiskPath,
        onCreateVdisk: () => openCreateVdiskWizard(activeFileioMountPoint.value ?? undefined),
      }),
    })
    await refreshAll()
  } catch { /* dismissed */ }
}

function openFileioWizardFor(row: VDiskFile) {
  if (!isVdiskEligibleForFileioBindRow(row)) return
  openFileioWizard([row], row.path)
}

const consumedIntentTokens = new Set<string>()

watch(
  () => props.startupIntent,
  async (intent) => {
    if (!intent || consumedIntentTokens.has(intent.token) || props.readOnly) return
    consumedIntentTokens.add(intent.token)
    if (intent.action === 'create-filesystem') {
      const requested = intent.device?.trim()
      if (requested) {
        const hit = backends.value.find(b => b.path === requested)
        if (hit && !hit.eligible) {
          const reason = hit.reasons.join(' · ') || String(t('storage.fs.wizard.create_fs.no_backend'))
          toast.warning(`${requested}: ${reason}`)
        }
      }
      await openCreateFsWizard(requested ?? undefined)
      emit('intent-consumed', intent.token)
    }
  },
  { immediate: true, deep: true },
)

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
