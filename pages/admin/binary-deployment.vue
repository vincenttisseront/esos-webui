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

    <UCard>
      <template #header>
        <span class="font-semibold">{{ t('admin.deployment.container.title') }}</span>
      </template>
      <p v-if="!containerFiles.length" class="text-sm text-gray-500">
        {{ t('admin.deployment.container.empty') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-4">{{ t('admin.deployment.container.path') }}</th>
              <th class="py-2 pr-4">{{ t('admin.deployment.container.size') }}</th>
              <th class="py-2 pr-4">{{ t('admin.deployment.container.mtime') }}</th>
              <th class="py-2" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="f in containerFiles"
              :key="f.relativePath"
              class="border-b border-gray-100 dark:border-gray-800"
            >
              <td class="py-2 pr-4 font-mono text-xs">{{ f.relativePath }}</td>
              <td class="py-2 pr-4">{{ formatBytes(f.sizeBytes) }}</td>
              <td class="py-2 pr-4 text-xs text-gray-500">{{ formatMtime(f.mtimeMs) }}</td>
              <td class="py-2">
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  :loading="importingPath === f.relativePath"
                  @click="importFromContainer(f.relativePath)"
                >
                  {{ t('admin.deployment.container.import') }}
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-semibold">{{ t('admin.deployment.catalog.title') }}</span>
      </template>
      <p v-if="!catalog.length" class="text-sm text-gray-500">
        {{ t('admin.deployment.catalog.empty') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-4">{{ t('admin.deployment.catalog.name') }}</th>
              <th class="py-2 pr-4">{{ t('admin.deployment.catalog.version') }}</th>
              <th class="py-2 pr-4">{{ t('admin.deployment.container.size') }}</th>
              <th class="py-2 pr-4">{{ t('admin.deployment.catalog.sha256') }}</th>
              <th class="py-2">{{ t('admin.deployment.catalog.imported') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in catalog"
              :key="b.id"
              class="border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
              :class="{ 'bg-primary-50 dark:bg-primary-950/30': selectedBinaryId === b.id }"
              @click="selectedBinaryId = b.id"
            >
              <td class="py-2 pr-4">{{ b.name }}</td>
              <td class="py-2 pr-4">{{ b.version ?? '—' }}</td>
              <td class="py-2 pr-4">{{ formatBytes(b.sizeBytes) }}</td>
              <td class="py-2 pr-4 font-mono text-xs">{{ b.sha256.slice(0, 16) }}…</td>
              <td class="py-2 text-xs text-gray-500">{{ b.createdAt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-semibold">{{ t('admin.deployment.deploy.title') }}</span>
      </template>
      <div class="space-y-4">
        <p v-if="!selectedBinaryId" class="text-xs text-amber-600">
          {{ t('admin.deployment.deploy.no_binary') }}
        </p>
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
          <p v-if="!selectedSanIds.length" class="text-xs text-amber-600">
            {{ t('admin.deployment.deploy.no_sans') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-heroicons-rocket-launch"
          :disabled="!canDeploy"
          :loading="deploying"
          @click="confirmDeployOpen = true"
        >
          {{ t('admin.deployment.deploy.run') }}
        </UButton>
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
            @click="retryJob"
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
            <UBadge :color="targetBadgeColor(target.status)" size="xs">
              {{ targetStatusLabel(target.status) }}
            </UBadge>
          </div>
          <p v-if="target.errorMessage" class="text-xs text-red-600 mt-1">{{ target.errorMessage }}</p>
          <details v-if="target.logs" class="mt-2">
            <summary class="text-xs text-gray-500 cursor-pointer">{{ t('admin.deployment.job.logs') }}</summary>
            <pre class="text-xs mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-300 max-h-40 overflow-auto">{{ target.logs }}</pre>
          </details>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="confirmDeployOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">{{ t('admin.deployment.deploy.confirm_title') }}</h3>
          <p class="text-sm text-gray-600">
            {{ confirmMessage }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="outline" @click="confirmDeployOpen = false">
              {{ t('common.actions.cancel') }}
            </UButton>
            <UButton color="primary" :loading="deploying" @click="runDeploy">
              {{ t('admin.deployment.deploy.run') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { ContainerBinaryEntry, DeploymentBinaryDto, DeploymentJobDto } from '~/types/deployment'

definePageMeta({ layout: 'default' })

const { t } = useEsosI18n()
const toast = useAppToast()
const { activeSans } = useSelectedSan()

const loading = ref(false)
const containerDir = ref('')
const containerFiles = ref<ContainerBinaryEntry[]>([])
const catalog = ref<DeploymentBinaryDto[]>([])
const importingPath = ref<string | null>(null)

const selectedBinaryId = ref<string | null>(null)
const selectedSanIds = ref<string[]>([])
const deploying = ref(false)
const confirmDeployOpen = ref(false)
const activeJobId = ref<string | null>(null)
const activeJob = ref<DeploymentJobDto | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const selectedBinary = computed(() =>
  catalog.value.find(b => b.id === selectedBinaryId.value) ?? null,
)

const canDeploy = computed(() =>
  Boolean(selectedBinaryId.value) && selectedSanIds.value.length > 0 && !deploying.value,
)

const confirmMessage = computed(() => {
  const name = selectedBinary.value?.name ?? '—'
  return t('admin.deployment.deploy.confirm_msg', {
    name,
    count: selectedSanIds.value.length,
  }) as string
})

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 ** 2)).toFixed(1)} MiB`
}

function formatMtime(ms: number): string {
  return new Date(ms).toLocaleString()
}

function targetBadgeColor(status: string): 'gray' | 'blue' | 'amber' | 'green' | 'red' {
  switch (status) {
    case 'success': return 'green'
    case 'failed': return 'red'
    case 'uploading':
    case 'applying': return 'blue'
    default: return 'gray'
  }
}

function targetStatusLabel(status: string): string {
  const key = `admin.deployment.job.status_${status}` as const
  return t(key) as string
}

async function reload() {
  loading.value = true
  try {
    const [containerRes, catalogRes] = await Promise.all([
      $fetch<{ binariesDir: string; files: ContainerBinaryEntry[] }>('/api/admin/deployment/container'),
      $fetch<{ binaries: DeploymentBinaryDto[] }>('/api/admin/deployment/catalog'),
    ])
    containerDir.value = containerRes.binariesDir
    containerFiles.value = containerRes.files
    catalog.value = catalogRes.binaries
    if (!selectedBinaryId.value && catalog.value.length) {
      selectedBinaryId.value = catalog.value[0]!.id
    }
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  } finally {
    loading.value = false
  }
}

async function importFromContainer(relativePath: string) {
  importingPath.value = relativePath
  try {
    const res = await $fetch<{ binary: DeploymentBinaryDto }>('/api/admin/deployment/catalog/import', {
      method: 'POST',
      body: { sourcePath: relativePath },
    })
    toast.success(t('admin.deployment.container.import') as string, res.binary.name)
    await reload()
    selectedBinaryId.value = res.binary.id
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, String(err))
  } finally {
    importingPath.value = null
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function pollJob() {
  if (!activeJobId.value) return
  try {
    const res = await $fetch<{ job: DeploymentJobDto }>(`/api/admin/deployment/jobs/${activeJobId.value}`)
    activeJob.value = res.job
    if (['success', 'failed', 'partial'].includes(res.job.status)) {
      stopPolling()
    }
  } catch {
    stopPolling()
  }
}

async function runDeploy() {
  if (!selectedBinaryId.value || !selectedSanIds.value.length) return
  deploying.value = true
  confirmDeployOpen.value = false
  try {
    const res = await $fetch<{ job: DeploymentJobDto }>('/api/admin/deployment/jobs', {
      method: 'POST',
      body: { binaryId: selectedBinaryId.value, sanIds: selectedSanIds.value },
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

async function retryJob() {
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
