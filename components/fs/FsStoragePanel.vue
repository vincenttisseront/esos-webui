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
          :disabled="!fs.mounts.length"
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
      <template #header>{{ t('storage.fs.overview.mounts_title') }}</template>
      <UTable v-if="fs.mounts.length" :rows="fs.mounts" :columns="mountCols">
        <template #mountPoint-data="{ row }">
          <span class="font-mono text-xs">{{ row.mountPoint }}</span>
        </template>
        <template #health-data="{ row }">
          <UBadge v-if="row.health" :color="healthColor(row.health)" size="xs" :label="row.health" />
        </template>
        <template #size-data="{ row }">
          {{ formatBytes(row.totalBytes) }} / {{ formatBytes(row.freeBytes) }} free
        </template>
        <template #actions-data="{ row }">
          <UButton v-if="!readOnly" size="xs" color="red" variant="ghost" @click="confirmUnmount(row.mountPoint)">
            {{ t('storage.fs.actions.unmount') }}
          </UButton>
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_mounts') }}</p>
    </UCard>

    <UCard>
      <template #header>{{ t('storage.fs.overview.candidates_title') }}</template>
      <UTable v-if="fs.candidates.length" :rows="fs.candidates" :columns="candCols">
        <template #path-data="{ row }">
          <span class="font-mono text-xs">{{ row.path }}</span>
        </template>
        <template #reasons-data="{ row }">
          <span v-if="row.eligible" class="text-green-600 text-xs">OK</span>
          <span v-else class="text-red-600 text-xs">{{ row.reasons.join(', ') }}</span>
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_candidates') }}</p>
    </UCard>

    <UCard>
      <template #header>{{ t('storage.fs.overview.vdisks_title') }}</template>
      <UTable v-if="fs.vdiskFiles.length" :rows="fs.vdiskFiles" :columns="vdiskCols">
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
    </UCard>

    <UCard>
      <template #header>{{ t('storage.fs.overview.fileio_title') }}</template>
      <UTable v-if="fileioDevices.length" :rows="fileioDevices" :columns="fileioCols">
        <template #name-data="{ row }">
          <span class="font-mono text-xs">{{ row.name }}</span>
        </template>
        <template #filename-data="{ row }">
          <span class="font-mono text-xs break-all">{{ row.filename }}</span>
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
      <template #header>{{ t('storage.fs.overview.luns_title') }}</template>
      <UTable v-if="lunMappings.length" :rows="lunMappings" :columns="lunCols">
        <template #targetName-data="{ row }">
          <span class="font-mono text-xs">{{ row.targetName }}</span>
        </template>
        <template #groupName-data="{ row }">
          <span class="text-xs">{{ row.groupName || '—' }}</span>
        </template>
        <template #filename-data="{ row }">
          <span class="font-mono text-xs break-all">{{ row.filename || '—' }}</span>
        </template>
        <template #readOnly-data="{ row }">
          <UBadge v-if="row.readOnly" color="amber" size="xs" :label="t('storage.targets.detail.readOnlyBadge')" />
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_luns') }}</p>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { buildFsProvisioningSteps, formatBytes } from '~/utils/fs-provisioning-chain'
import type { MountHealth, VDiskFile } from '~/types/filesystem'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  readOnly?: boolean
}>()

const { t } = useEsosI18n()
const fs = useFsStore()
const toast = useAppToast()
const { open: openModal } = useAppModal()
const refreshing = ref(false)

onMounted(async () => {
  fs.setSanId(props.sanId)
  if (props.clusterId) fs.setClusterContext(props.clusterId, props.sanId)
  await refreshAll()
})

const chainSteps = computed(() => buildFsProvisioningSteps(fs.overview))
const eligibleCandidates = computed(() => fs.candidates.filter(c => c.eligible))
const unmappedVdisks = computed(() => fs.vdiskFiles.filter(v => !v.mapped))
const fileioDevices = computed(() => fs.fileioDevices)
const lunMappings = computed(() => fs.lunMappings)
const scanWarnings = computed(() => fs.overview?.scanWarnings ?? [])

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
const candCols = [
  { key: 'path', label: t('storage.fs.table.path') },
  { key: 'kind', label: t('storage.fs.table.type') },
  { key: 'reasons', label: '' },
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

function healthColor(h: MountHealth) {
  if (h === 'full') return 'red'
  if (h === 'degraded') return 'amber'
  return 'green'
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
    await Promise.all([fs.fetchOverview(true), fs.fetchCandidates()])
  } finally {
    refreshing.value = false
  }
}

async function openCreateFsWizard() {
  const { default: Wizard } = await import('~/components/fs/CreateFilesystemWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: wizardProps({ candidates: fs.candidates }),
    })
    await refreshAll()
  } catch { /* dismissed */ }
}

async function openCreateVdiskWizard() {
  const { default: Wizard } = await import('~/components/fs/CreateVdiskWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: wizardProps({ mounts: fs.mounts }),
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
