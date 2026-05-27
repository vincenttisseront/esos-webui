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

    <BinaryCatalogContainerList
      :files="containerFiles"
      :importing-path="importingPath"
      @import="importFromContainer"
    />

    <BinaryCatalogRegisteredList :binaries="catalog" />

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

    <UCard v-if="history.length">
      <template #header>
        <span class="font-semibold">{{ t('admin.deployment.history.title') }}</span>
      </template>
      <div class="space-y-2 text-sm">
        <div
          v-for="job in history"
          :key="job.id"
          class="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 py-2"
        >
          <span class="font-mono text-xs text-gray-400">{{ job.createdAt }}</span>
          <UBadge size="xs" color="neutral">{{ job.scope }}</UBadge>
          <span>{{ job.status }}</span>
          <span class="text-gray-500">→ {{ job.targets.map(t => t.sanId).join(', ') }}</span>
        </div>
      </div>
    </UCard>

    <UCard v-if="activeJob">
      <template #header>
        <div class="flex items-center justify-between gap-2 w-full">
          <span class="font-semibold">{{ t('admin.deployment.job.title') }} — {{ activeJob.status }}</span>
          <UButton
            v-if="activeJob.targets.some(t => t.status === 'failed')"
            size="xs"
            color="amber"
            variant="outline"
            @click="retryBulkJob"
          >
            {{ t('admin.deployment.job.retry') }}
          </UButton>
        </div>
      </template>
      <div class="space-y-3">
        <div
          v-for="target in activeJob.targets"
          :key="target.id"
          class="rounded border border-gray-200 dark:border-gray-700 p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-sm">{{ target.sanId }}</span>
            <DeploymentStatusBadge :status="target.status" />
          </div>
          <DeploymentLogsPanel :logs="target.logs" :error-message="target.errorMessage" />
        </div>
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
  </div>
</template>

<script setup lang="ts">
import type { ContainerBinaryEntry, DeploymentBinaryDto, DeploymentJobDto } from '~/types/deployment'
import { isDeploymentJobRunning } from '~/utils/deployment-ui'
import BinaryCatalogContainerList from '~/components/deployment/BinaryCatalogContainerList.vue'
import BinaryCatalogRegisteredList from '~/components/deployment/BinaryCatalogRegisteredList.vue'
import DeploymentStatusBadge from '~/components/deployment/DeploymentStatusBadge.vue'
import DeploymentLogsPanel from '~/components/deployment/DeploymentLogsPanel.vue'

definePageMeta({ layout: 'default' })

const { t } = useEsosI18n()
const toast = useAppToast()
const { activeSans } = useSelectedSan()

const loading = ref(false)
const containerDir = ref('')
const containerFiles = ref<ContainerBinaryEntry[]>([])
const catalog = ref<DeploymentBinaryDto[]>([])
const history = ref<DeploymentJobDto[]>([])
const importingPath = ref<string | null>(null)

const bulkBinaryId = ref<string | null>(null)
const selectedSanIds = ref<string[]>([])
const deploying = ref(false)
const confirmBulkOpen = ref(false)
const activeJobId = ref<string | null>(null)
const activeJob = ref<DeploymentJobDto | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const bulkBinaryItems = computed(() =>
  catalog.value.map(b => ({ value: b.id, label: b.name })),
)

const canBulkDeploy = computed(() =>
  Boolean(bulkBinaryId.value) && selectedSanIds.value.length > 0 && !deploying.value,
)

const confirmMessage = computed(() => {
  const name = catalog.value.find(b => b.id === bulkBinaryId.value)?.name ?? '—'
  return t('admin.deployment.deploy.confirm_msg', { name, count: selectedSanIds.value.length }) as string
})

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function reload() {
  loading.value = true
  try {
    const [containerRes, catalogRes, historyRes] = await Promise.all([
      $fetch<{ binariesDir: string; files: ContainerBinaryEntry[] }>('/api/admin/deployment/container'),
      $fetch<{ binaries: DeploymentBinaryDto[] }>('/api/admin/deployment/catalog'),
      $fetch<{ jobs: DeploymentJobDto[] }>('/api/admin/deployment/history'),
    ])
    containerDir.value = containerRes.binariesDir
    containerFiles.value = containerRes.files
    catalog.value = catalogRes.binaries
    history.value = historyRes.jobs
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  } finally {
    loading.value = false
  }
}

async function importFromContainer(relativePath: string) {
  importingPath.value = relativePath
  try {
    await $fetch('/api/admin/deployment/catalog/import', {
      method: 'POST',
      body: { sourcePath: relativePath },
    })
    toast.success(t('admin.deployment.container.import') as string)
    await reload()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  } finally {
    importingPath.value = null
  }
}

async function pollJob() {
  if (!activeJobId.value) return
  try {
    const res = await $fetch<{ job: DeploymentJobDto }>(`/api/admin/deployment/jobs/${activeJobId.value}`)
    activeJob.value = res.job
    if (!isDeploymentJobRunning(res.job.status)) {
      stopPolling()
      await reload()
    }
  } catch {
    stopPolling()
  }
}

async function runBulkDeploy() {
  if (!bulkBinaryId.value || !selectedSanIds.value.length) return
  deploying.value = true
  confirmBulkOpen.value = false
  try {
    const res = await $fetch<{ job: DeploymentJobDto }>('/api/admin/deployment/jobs', {
      method: 'POST',
      body: { binaryId: bulkBinaryId.value, sanIds: selectedSanIds.value },
    })
    activeJobId.value = res.job.id
    activeJob.value = res.job
    stopPolling()
    pollTimer = setInterval(() => { void pollJob() }, 2000)
    void pollJob()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  } finally {
    deploying.value = false
  }
}

async function retryBulkJob() {
  if (!activeJobId.value) return
  try {
    await $fetch(`/api/admin/deployment/jobs/${activeJobId.value}/retry`, { method: 'POST' })
    stopPolling()
    pollTimer = setInterval(() => { void pollJob() }, 2000)
    void pollJob()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  }
}

onMounted(() => { void reload() })
onUnmounted(() => stopPolling())
</script>
