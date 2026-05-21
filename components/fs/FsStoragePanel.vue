<template>
  <div class="space-y-4">
    <UAlert color="blue" variant="soft" :title="t('storage.fs.help.title')" :description="t('storage.fs.help.body')" />

    <FsProvisioningChain :steps="chainSteps" />

    <div class="flex flex-wrap gap-2 justify-between items-center">
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" color="primary" icon="i-heroicons-plus" :disabled="readOnly" @click="showFsWizard = true">
          {{ t('storage.fs.actions.create_fs') }}
        </UButton>
        <UButton size="sm" color="primary" variant="soft" icon="i-heroicons-document-plus" :disabled="readOnly || !fs.mounts.length" @click="showVdiskWizard = true">
          {{ t('storage.fs.actions.create_vdisk') }}
        </UButton>
        <UButton size="sm" color="primary" variant="soft" icon="i-heroicons-circle-stack" :disabled="readOnly || !unmappedVdisks.length" @click="openFileioWizard">
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
      <UTable v-if="eligibleCandidates.length" :rows="eligibleCandidates" :columns="candCols">
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
          <UBadge :color="row.mapped ? 'green' : 'gray'" size="xs" :label="row.mapped ? t('storage.fs.table.mapped') : t('storage.fs.table.unmapped')" />
        </template>
        <template #actions-data="{ row }">
          <UButton v-if="!readOnly && !row.mapped" size="xs" color="red" variant="ghost" @click="confirmDeleteVdisk(row.path)">
            {{ t('storage.fs.actions.delete_vdisk') }}
          </UButton>
        </template>
      </UTable>
      <p v-else class="text-sm text-gray-500">{{ t('storage.fs.overview.empty_vdisks') }}</p>
    </UCard>

    <UModal v-model="showFsWizard">
      <CreateFilesystemWizard
        :san-id="sanId"
        :cluster-id="clusterId"
        :is-clustered="isClustered"
        :candidates="fs.candidates"
        @done="onWizardDone"
        @close="showFsWizard = false"
      />
    </UModal>
    <UModal v-model="showVdiskWizard">
      <CreateVdiskWizard
        :san-id="sanId"
        :cluster-id="clusterId"
        :is-clustered="isClustered"
        :mounts="fs.mounts"
        @done="onWizardDone"
        @close="showVdiskWizard = false"
      />
    </UModal>
    <UModal v-model="showFileioWizard">
      <CreateFileioWizard
        :san-id="sanId"
        :cluster-id="clusterId"
        :is-clustered="isClustered"
        :vdisk="fileioTarget"
        @done="onFileioDone"
        @close="showFileioWizard = false"
      />
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { buildFsProvisioningSteps, formatBytes } from '~/utils/fs-provisioning-chain'
import type { VDiskFile } from '~/types/filesystem'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  readOnly?: boolean
}>()

const { t } = useEsosI18n()
const fs = useFsStore()
const toast = useAppToast()
const refreshing = ref(false)
const showFsWizard = ref(false)
const showVdiskWizard = ref(false)
const showFileioWizard = ref(false)
const fileioTarget = ref<VDiskFile | null>(null)

onMounted(async () => {
  fs.setSanId(props.sanId)
  if (props.clusterId) fs.setClusterContext(props.clusterId, props.sanId)
  await refreshAll()
})

const chainSteps = computed(() => buildFsProvisioningSteps(fs.overview))
const eligibleCandidates = computed(() => fs.candidates.filter(c => c.eligible))
const unmappedVdisks = computed(() => fs.vdiskFiles.filter(v => !v.mapped))

const mountCols = [
  { key: 'mountPoint', label: t('storage.fs.table.mount_point') },
  { key: 'backingDevice', label: t('storage.fs.table.backing') },
  { key: 'fsType', label: t('storage.fs.table.type') },
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

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.all([fs.fetchOverview(true), fs.fetchCandidates()])
  } finally {
    refreshing.value = false
  }
}

function openFileioWizard() {
  fileioTarget.value = unmappedVdisks.value[0] ?? null
  showFileioWizard.value = true
}

async function onWizardDone() {
  showFsWizard.value = false
  showVdiskWizard.value = false
  await refreshAll()
  toast.success('OK')
}

async function onFileioDone(payload: { route: string; query?: Record<string, string> }) {
  showFileioWizard.value = false
  await refreshAll()
  if (payload?.route) {
    await navigateTo({ path: payload.route, query: payload.query })
  }
}

async function confirmDeleteVdisk(path: string) {
  const pre = await fs.preflight('delete_vdisk', { path })
  const conf = prompt(pre.requiredConfirmation ?? '')
  if (conf !== pre.requiredConfirmation) return
  await fs.deleteVdisk(path, conf)
  await refreshAll()
}

async function confirmUnmount(mountPoint: string) {
  const pre = await fs.preflight('unmount', { mountPoint })
  const conf = prompt(pre.requiredConfirmation ?? '')
  if (conf !== pre.requiredConfirmation) return
  await fs.unmount(mountPoint, conf)
  await refreshAll()
}
</script>
