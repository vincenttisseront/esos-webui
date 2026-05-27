<template>
  <div class="p-6 space-y-6 max-w-6xl mx-auto">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {{ t('admin.deployment.page.title') }}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {{ t('admin.deployment.page.subtitle') }}
        </p>
        <p v-if="containerDir" class="text-xs text-gray-400 mt-1 font-mono">
          {{ containerDir }}
        </p>
      </div>
      <UButton
        icon="i-heroicons-arrow-path"
        size="sm"
        color="gray"
        variant="soft"
        :loading="loading"
        @click="reload"
      >
        {{ t('admin.deployment.page.refresh') }}
      </UButton>
    </header>

    <BinaryUploadCard @uploaded="reload" />

    <ContainerBinaryList
      :files="containerFiles"
      :registering-path="registeringPath"
      @register="registerFromContainer"
    />

    <RegisteredBinaryCatalog
      :binaries="catalog"
      :deleting-id="deletingId"
      @delete-catalog="confirmDeleteCatalog"
      @delete-file="confirmDeleteFile"
      @delete-full="confirmDeleteFull"
    />

    <UCard>
      <template #header>
        <span class="font-semibold text-gray-600">{{ t('admin.deployment.bulk.title') }}</span>
      </template>
      <p class="text-sm text-gray-500 mb-4">
        {{ t('admin.deployment.bulk.hint') }}
      </p>
      <div class="space-y-4">
        <AppFormField :label="t('admin.deployment.deploy.select_binary') as string">
          <USelectMenu
            v-model="bulkBinaryId"
            :items="bulkBinaryItems"
            value-key="value"
            label-key="label"
            :placeholder="t('admin.deployment.san.select_placeholder') as string"
            class="w-full max-w-md"
          />
        </AppFormField>
        <div class="space-y-2">
          <p class="text-xs font-medium text-gray-500 uppercase">
            {{ t('admin.deployment.deploy.select_sans') }}
          </p>
          <div class="flex flex-wrap gap-3">
            <label
              v-for="san in activeSans"
              :key="san.id"
              class="flex items-center gap-2 text-sm"
            >
              <input
                v-model="selectedSanIds"
                type="checkbox"
                :value="san.id"
                :disabled="san.readOnly"
              >
              <span :class="san.readOnly ? 'text-gray-400 line-through' : ''">{{ san.label }}</span>
            </label>
          </div>
        </div>
        <UButton
          color="gray"
          variant="outline"
          icon="i-heroicons-rocket-launch"
          :disabled="!canBulkDeploy"
          :loading="deploying"
          @click="confirmBulkOpen = true"
        >
          {{ t('admin.deployment.bulk.run') }}
        </UButton>
      </div>
    </UCard>

    <UModal v-model:open="confirmBulkOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">{{ t('admin.deployment.deploy.confirm_title') }}</h3>
          <p class="text-sm text-gray-600">{{ confirmMessage }}</p>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="outline" @click="confirmBulkOpen = false">
              {{ t('common.actions.cancel') }}
            </UButton>
            <UButton color="primary" :loading="deploying" @click="runBulkDeploy">
              {{ t('admin.deployment.bulk.run') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteModal.open">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">{{ deleteModal.title }}</h3>
          <p class="text-sm text-gray-600">{{ deleteModal.message }}</p>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="outline" @click="deleteModal.open = false">
              {{ t('common.actions.cancel') }}
            </UButton>
            <UButton color="red" :loading="!!deletingId" @click="runDelete">
              {{ t('common.actions.confirm') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { ContainerBinaryListItem, DeploymentBinaryDto, DeploymentJobDto } from '~/types/deployment'
import { isBinaryDeployable } from '~/utils/deployment-ui'
import BinaryUploadCard from '~/components/deployment/BinaryUploadCard.vue'
import ContainerBinaryList from '~/components/deployment/ContainerBinaryList.vue'
import RegisteredBinaryCatalog from '~/components/deployment/RegisteredBinaryCatalog.vue'

definePageMeta({ layout: 'default' })

const { t } = useEsosI18n()
const toast = useAppToast()
const { activeSans } = useSelectedSan()

const loading = ref(false)
const containerDir = ref('')
const containerFiles = ref<ContainerBinaryListItem[]>([])
const catalog = ref<DeploymentBinaryDto[]>([])
const registeringPath = ref<string | null>(null)
const deletingId = ref<string | null>(null)

const bulkBinaryId = ref<string | null>(null)
const selectedSanIds = ref<string[]>([])
const deploying = ref(false)
const confirmBulkOpen = ref(false)

const deleteModal = reactive({
  open: false,
  title: '',
  message: '',
  action: null as (() => Promise<void>) | null,
})

const bulkBinaryItems = computed(() =>
  catalog.value.filter(isBinaryDeployable).map(b => ({ value: b.id, label: b.name })),
)

const canBulkDeploy = computed(() =>
  Boolean(bulkBinaryId.value) && selectedSanIds.value.length > 0 && !deploying.value,
)

const confirmMessage = computed(() => {
  const name = catalog.value.find(b => b.id === bulkBinaryId.value)?.name ?? '—'
  return t('admin.deployment.deploy.confirm_msg', { name, count: selectedSanIds.value.length }) as string
})

async function reload() {
  loading.value = true
  try {
    const [containerRes, catalogRes] = await Promise.all([
      $fetch<{ binariesDir: string; files: ContainerBinaryListItem[] }>('/api/admin/binaries/container'),
      $fetch<{ binaries: DeploymentBinaryDto[] }>('/api/admin/binaries'),
    ])
    containerDir.value = containerRes.binariesDir
    containerFiles.value = containerRes.files
    catalog.value = catalogRes.binaries
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  } finally {
    loading.value = false
  }
}

async function registerFromContainer(relativePath: string) {
  const filename = relativePath.split('/').pop() ?? relativePath
  registeringPath.value = relativePath
  try {
    await $fetch('/api/admin/binaries/register', { method: 'POST', body: { filename } })
    toast.success(t('admin.deployment.container.register_action') as string)
    await reload()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  } finally {
    registeringPath.value = null
  }
}

function confirmDeleteCatalog(binary: DeploymentBinaryDto) {
  deleteModal.title = t('admin.deployment.catalog.delete_catalog_confirm_title') as string
  deleteModal.message = t('admin.deployment.catalog.delete_catalog_confirm', { name: binary.name }) as string
  deleteModal.action = async () => {
    deletingId.value = `${binary.id}:catalog`
    await $fetch(`/api/admin/binaries/${binary.id}`, { method: 'DELETE' })
    toast.success(t('admin.deployment.catalog.deleted_catalog') as string)
  }
  deleteModal.open = true
}

function confirmDeleteFile(binary: DeploymentBinaryDto) {
  deleteModal.title = t('admin.deployment.catalog.delete_file_confirm_title') as string
  deleteModal.message = t('admin.deployment.catalog.delete_file_confirm', { name: binary.name }) as string
  deleteModal.action = async () => {
    deletingId.value = `${binary.id}:file`
    await $fetch(`/api/admin/binaries/${binary.id}/file`, { method: 'DELETE' })
    toast.success(t('admin.deployment.catalog.deleted_file') as string)
  }
  deleteModal.open = true
}

function confirmDeleteFull(binary: DeploymentBinaryDto) {
  deleteModal.title = t('admin.deployment.catalog.delete_full_confirm_title') as string
  deleteModal.message = t('admin.deployment.catalog.delete_full_confirm', { name: binary.name }) as string
  deleteModal.action = async () => {
    deletingId.value = `${binary.id}:full`
    await $fetch(`/api/admin/binaries/${binary.id}/full`, { method: 'DELETE' })
    toast.success(t('admin.deployment.catalog.deleted_full') as string)
  }
  deleteModal.open = true
}

async function runDelete() {
  try {
    await deleteModal.action?.()
    deleteModal.open = false
    await reload()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  } finally {
    deletingId.value = null
  }
}

async function runBulkDeploy() {
  if (!bulkBinaryId.value || !selectedSanIds.value.length) return
  deploying.value = true
  confirmBulkOpen.value = false
  try {
    await $fetch<{ job: DeploymentJobDto }>('/api/admin/deployment/jobs', {
      method: 'POST',
      body: { binaryId: bulkBinaryId.value, sanIds: selectedSanIds.value },
    })
    toast.success(t('admin.deployment.san.deploy_started') as string)
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  } finally {
    deploying.value = false
  }
}

onMounted(() => { void reload() })
</script>
