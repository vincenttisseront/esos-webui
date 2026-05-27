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
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {{ t('admin.deployment.page.deploy_hint') }}
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

    <BinaryCatalogStatusPanel ref="statusPanel" />
    <BinaryUploadCard @uploaded="onUploaded" />

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
import type { ContainerBinaryListItem, DeploymentBinaryDto } from '~/types/deployment'
import BinaryCatalogStatusPanel from '~/components/deployment/BinaryCatalogStatusPanel.vue'
import BinaryUploadCard from '~/components/deployment/BinaryUploadCard.vue'
import ContainerBinaryList from '~/components/deployment/ContainerBinaryList.vue'
import RegisteredBinaryCatalog from '~/components/deployment/RegisteredBinaryCatalog.vue'

definePageMeta({ layout: 'default' })

const { t } = useEsosI18n()
const toast = useAppToast()

const statusPanel = ref<{ reload: () => Promise<void> } | null>(null)
const loading = ref(false)
const containerDir = ref('')
const containerFiles = ref<ContainerBinaryListItem[]>([])
const catalog = ref<DeploymentBinaryDto[]>([])
const registeringPath = ref<string | null>(null)
const deletingId = ref<string | null>(null)

const deleteModal = reactive({
  open: false,
  title: '',
  message: '',
  action: null as (() => Promise<void>) | null,
})

async function onUploaded() {
  await reload()
  await statusPanel.value?.reload()
}

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

onMounted(() => { void reload() })
</script>
