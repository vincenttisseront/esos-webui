<template>
  <div class="space-y-4">
    <StorageReadOnlyBanner :read-only="readOnly" />

    <UAlert color="blue" variant="soft" :title="t('storage.fs.help.title')" :description="t('storage.fs.help.body')" />

    <UAlert
      v-if="nextActionText"
      color="primary"
      variant="soft"
      :title="t('storage.fs.next.title')"
      :description="nextActionText"
    />

    <UAlert
      v-if="!eligibleCandidates.length && backends.length"
      color="amber"
      variant="soft"
      :title="t('storage.fs.overview.candidates_title')"
      :description="noEligibleSummary"
    />

    <UAlert
      v-if="scanWarnings.length"
      color="amber"
      variant="soft"
      :title="t('storage.fs.overview.scan_warnings')"
    >
      <ul class="text-xs list-disc pl-4">
        <li v-for="(w, i) in scanWarnings" :key="i">{{ w }}</li>
      </ul>
    </UAlert>

    <FsProvisioningChain :steps="chainSteps" />

    <div class="flex flex-wrap gap-2 justify-between items-center">
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
      <UButton size="sm" color="gray" variant="ghost" icon="i-heroicons-arrow-path" :loading="refreshing" @click="refreshAll">
        {{ t('storage.fs.overview.refresh') }}
      </UButton>
    </div>

    <UCard>
      <template #header>{{ t('storage.fs.overview.fileio_title') }}</template>
      <UTable v-if="fileioDevices.length" :rows="fileioDevices" :columns="fileioCols">
        <template #name-data="{ row }">
          <button
            type="button"
            class="font-mono text-xs text-primary-600 hover:underline"
            @click="highlightLunsForDevice(row.name)"
          >
            {{ row.name }}
          </button>
        </template>
        <template #filename-data="{ row }">
          <button
            v-if="row.filename"
            type="button"
            class="font-mono text-xs break-all text-primary-600 hover:underline text-left"
            @click="highlightVdiskPath(row.filename)"
          >
            {{ row.filename }}
          </button>
          <span v-else class="text-gray-400">—</span>
        </template>
        <template #nv_cache-data="{ row }">
          {{ row.attrs.nv_cache ?? '—' }}
        </template>
        <template #mapped-data="{ row }">
          <UBadge
            :color="row.mapped ? 'green' : 'gray'"
            size="xs"
            :label="row.mapped ? t('storage.fs.table.mapped') : t('storage.fs.table.unmapped')"
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
      <UTable v-if="displayedLuns.length" :rows="displayedLuns" :columns="lunCols">
        <template #targetName-data="{ row }">
          <span class="font-mono text-xs">{{ row.targetName }}</span>
        </template>
        <template #groupName-data="{ row }">
          <span class="text-xs">{{ row.groupName || '—' }}</span>
        </template>
        <template #filename-data="{ row }">
          <button
            v-if="row.filename"
            type="button"
            class="font-mono text-xs break-all text-primary-600 hover:underline"
            @click="highlightVdiskPath(row.filename)"
          >
            {{ row.filename }}
          </button>
          <span v-else>—</span>
        </template>
        <template #readOnly-data="{ row }">
          <UBadge v-if="row.readOnly" color="amber" size="xs" :label="t('storage.targets.detail.readOnlyBadge')" />
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
      <UTable v-if="displayedVdisks.length" :rows="displayedVdisks" :columns="vdiskCols">
        <template #path-data="{ row }">
          <span class="font-mono text-xs break-all">{{ row.path }}</span>
        </template>
        <template #size-data="{ row }">{{ formatBytes(row.sizeBytes) }}</template>
        <template #mapped-data="{ row }">
          <UBadge
            :color="row.mapped ? 'green' : 'gray'"
            size="xs"
            :label="row.mapped ? t('storage.fs.table.mapped') : t('storage.fs.table.unmapped')"
          />
        </template>
        <template #actions-data="{ row }">
          <div v-if="!readOnly" class="flex gap-1">
            <UButton
              v-if="!row.mapped"
              size="xs"
              color="primary"
              variant="ghost"
              @click="openFileioWizardFor(row)"
            >
              {{ t('storage.fs.actions.bind_fileio') }}
            </UButton>
            <UButton
              v-if="!row.mapped"
              size="xs"
              color="red"
              variant="ghost"
              @click="confirmDeleteVdisk(row.path)"
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
      <UTable v-if="displayedMounts.length" :rows="displayedMounts" :columns="mountCols">
        <template #mountPoint-data="{ row }">
          <button
            type="button"
            class="font-mono text-xs text-primary-600 hover:underline"
            @click="vdiskFilterMount = row.mountPoint"
          >
            {{ row.mountPoint }}
          </button>
          <UBadge v-if="row.role" size="xs" variant="soft" class="ml-1" :label="roleLabel(row.role)" />
        </template>
        <template #backingDevice-data="{ row }">
          <button
            type="button"
            class="font-mono text-xs text-primary-600 hover:underline"
            @click="emit('navigate-block-devices', row.linkedBackendPath ?? row.backingDevice)"
          >
            {{ row.backingDevice }}
          </button>
        </template>
        <template #health-data="{ row }">
          <UBadge v-if="row.health" :color="healthColor(row.health)" size="xs" :label="row.health" />
        </template>
        <template #size-data="{ row }">
          {{ formatBytes(row.totalBytes) }} / {{ formatBytes(row.freeBytes) }} free
        </template>
        <template #actions-data="{ row }">
          <UButton
            v-if="!readOnly && row.role === 'fileio_data'"
            size="xs"
            color="red"
            variant="ghost"
            @click="confirmUnmount(row.mountPoint)"
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
      <UTable v-if="backends.length" :rows="backends" :columns="backendCols">
        <template #path-data="{ row }">
          <button
            type="button"
            class="font-mono text-xs text-primary-600 hover:underline"
            @click="emit('navigate-block-devices', row.path)"
          >
            {{ row.path }}
          </button>
        </template>
        <template #eligible-data="{ row }">
          <UBadge :color="row.eligible ? 'green' : 'gray'" size="xs" :label="row.eligible ? 'OK' : '—'" />
        </template>
        <template #reasons-data="{ row }">
          <span v-if="row.eligible" class="text-green-600 text-xs">OK</span>
          <span v-else class="text-red-600 text-xs">{{ row.reasons.join(' · ') || '—' }}</span>
        </template>
        <template #hw-data="{ row }">
          <span v-if="row.controllerLabel" class="text-xs">{{ row.controllerLabel }} / {{ row.hwLdId ?? '—' }}</span>
          <span v-else class="text-gray-400">—</span>
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_candidates') }}</p>
    </UCard>

    <details v-if="diagnostics" class="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
      <summary class="text-sm font-medium cursor-pointer select-none">
        {{ t('storage.fs.overview.diagnostics_title') }}
      </summary>
      <pre class="text-[11px] mt-2 overflow-x-auto text-gray-600 dark:text-gray-400">{{ diagnosticsText }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
import { buildFsProvisioningSteps, formatBytes } from '~/utils/fs-provisioning-chain'
import { fileioRelevantMounts } from '~/utils/fs-mount-classifier'
import type { FsMountRole, MountHealth, VDiskFile } from '~/types/filesystem'

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

const chainSteps = computed(() => buildFsProvisioningSteps(fs.overview))
const backends = computed(() => fs.backends)
const eligibleCandidates = computed(() => backends.value.filter(c => c.eligible))
const unmappedVdisks = computed(() => fs.vdiskFiles.filter(v => !v.mapped))
const fileioDevices = computed(() => fs.fileioDevices)
const lunMappings = computed(() => fs.lunMappings)
const scanWarnings = computed(() => fs.overview?.scanWarnings ?? [])
const diagnostics = computed(() => fs.diagnostics)

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
  if (!vdiskFilterMount.value) return fs.vdiskFiles
  return fs.vdiskFiles.filter(v => v.mountPoint === vdiskFilterMount.value)
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
  { key: 'mountPoint', label: t('storage.fs.table.mount_point') },
  { key: 'backingDevice', label: t('storage.fs.table.backing') },
  { key: 'fsType', label: t('storage.fs.table.type') },
  { key: 'health', label: '' },
  { key: 'size', label: t('storage.fs.table.size') },
  { key: 'actions', label: '' },
]
const backendCols = [
  { key: 'path', label: t('storage.fs.table.path') },
  { key: 'kind', label: t('storage.fs.table.type') },
  { key: 'eligible', label: '' },
  { key: 'reasons', label: '' },
  { key: 'hw', label: 'HW RAID' },
]
const vdiskCols = [
  { key: 'path', label: t('storage.fs.table.path') },
  { key: 'size', label: t('storage.fs.table.size') },
  { key: 'mapped', label: t('storage.fs.table.scst') },
  { key: 'actions', label: '' },
]
const fileioCols = [
  { key: 'name', label: t('storage.fs.table.device') },
  { key: 'filename', label: t('storage.fs.table.filename') },
  { key: 'nv_cache', label: t('storage.fs.table.nv_cache') },
  { key: 'mapped', label: t('storage.fs.table.scst') },
]
const lunCols = [
  { key: 'targetName', label: t('storage.fs.table.target') },
  { key: 'groupName', label: t('storage.fs.table.group') },
  { key: 'lunId', label: t('storage.fs.table.lun') },
  { key: 'deviceName', label: t('storage.fs.table.device') },
  { key: 'handler', label: t('storage.fs.table.handler') },
  { key: 'filename', label: t('storage.fs.table.filename') },
  { key: 'readOnly', label: '' },
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
