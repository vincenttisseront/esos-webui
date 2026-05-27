<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-archive-box-arrow-down" class="text-gray-500 size-5" />
        <span class="font-semibold text-gray-800 dark:text-gray-200">
          {{ t('admin.deployment.san.title') }}
        </span>
      </div>
    </template>

    <div class="space-y-4">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-heroicons-information-circle"
        :title="t('admin.deployment.san.help') as string"
      />

      <p v-if="!sanId" class="text-sm text-amber-700 dark:text-amber-300">
        {{ t('admin.deployment.san.no_san') }}
      </p>

      <template v-else>
        <p v-if="loading" class="text-sm text-gray-400 flex items-center gap-2">
          <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
          {{ t('common.loading') }}
        </p>

        <p v-else-if="!catalog.length" class="text-sm text-amber-700 dark:text-amber-300">
          {{ t('admin.deployment.san.empty_catalog') }}
          <NuxtLink to="/admin/binary-deployment" class="text-primary-600 hover:underline ml-1">
            {{ t('admin.deployment.san.catalog_link') }}
          </NuxtLink>
        </p>

        <template v-else>
          <AppFormField :label="t('admin.deployment.san.select_binary') as string">
            <USelectMenu
              v-model="selectedBinaryId"
              :items="binaryItems"
              value-key="value"
              label-key="label"
              :disabled="isDisabled"
              :placeholder="t('admin.deployment.san.select_placeholder') as string"
              class="w-full"
            />
          </AppFormField>

          <div
            v-if="selectedBinary"
            class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-xs space-y-1 text-gray-600 dark:text-gray-400"
          >
            <p><span class="font-medium">{{ t('admin.deployment.catalog.name') }}:</span> {{ selectedBinary.name }}</p>
            <p v-if="selectedBinary.version">
              <span class="font-medium">{{ t('admin.deployment.catalog.version') }}:</span> {{ selectedBinary.version }}
            </p>
            <p><span class="font-medium">{{ t('admin.deployment.container.size') }}:</span> {{ formatDeploymentBytes(selectedBinary.sizeBytes) }}</p>
            <p class="font-mono break-all"><span class="font-medium">{{ t('admin.deployment.catalog.sha256') }}:</span> {{ selectedBinary.sha256 }}</p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              icon="i-heroicons-rocket-launch"
              color="primary"
              :loading="deploying"
              :disabled="!canDeploy"
              @click="deploy"
            >
              {{ t('admin.deployment.san.deploy') }}
            </UButton>
            <UButton
              icon="i-heroicons-arrow-path"
              color="gray"
              variant="outline"
              size="sm"
              :loading="loading"
              @click="reload"
            >
              {{ t('admin.deployment.page.refresh') }}
            </UButton>
          </div>
        </template>

        <div v-if="latest?.target" class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-medium text-gray-500 uppercase">
              {{ t('admin.deployment.san.last_deployment') }}
            </p>
            <DeploymentStatusBadge :status="latest.target.status" />
          </div>
          <p v-if="latest.binary" class="text-sm text-gray-700 dark:text-gray-300">
            {{ latest.binary.name }}
            <span v-if="latest.binary.version" class="text-gray-400">({{ latest.binary.version }})</span>
          </p>
          <DeploymentLogsPanel
            :logs="latest.target.logs"
            :error-message="latest.target.errorMessage"
          />
          <UButton
            v-if="latest.target.status === 'failed' && latest.job.id"
            size="xs"
            color="amber"
            variant="outline"
            :loading="retrying"
            :disabled="isDisabled"
            @click="retry"
          >
            {{ t('admin.deployment.job.retry') }}
          </UButton>
        </div>
      </template>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { DeploymentBinaryDto, SanLatestDeploymentDto } from '~/types/deployment'
import { formatDeploymentBytes, isDeploymentJobRunning } from '~/utils/deployment-ui'
import DeploymentStatusBadge from '~/components/deployment/DeploymentStatusBadge.vue'
import DeploymentLogsPanel from '~/components/deployment/DeploymentLogsPanel.vue'

const props = defineProps<{
  sanId: string
  disabled?: boolean
}>()

const { t, tError } = useEsosI18n()
const toast = useAppToast()

const loading = ref(false)
const deploying = ref(false)
const retrying = ref(false)
const catalog = ref<DeploymentBinaryDto[]>([])
const selectedBinaryId = ref<string | null>(null)
const latest = ref<SanLatestDeploymentDto>(null)
const activeJobId = ref<string | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const isDisabled = computed(() => Boolean(props.disabled) || !props.sanId || deploying.value || retrying.value)

const binaryItems = computed(() =>
  catalog.value.map(b => ({
    value: b.id,
    label: b.version ? `${b.name} (${b.version})` : b.name,
  })),
)

const selectedBinary = computed(() =>
  catalog.value.find(b => b.id === selectedBinaryId.value) ?? null,
)

const canDeploy = computed(() =>
  Boolean(props.sanId) && Boolean(selectedBinaryId.value) && !isDisabled.value && !deploying.value,
)

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function pollActiveJob() {
  if (!activeJobId.value || !props.sanId) return
  try {
    const res = await $fetch<{
      job: NonNullable<SanLatestDeploymentDto>['job']
      target: NonNullable<SanLatestDeploymentDto>['target']
      binary: DeploymentBinaryDto | null
    }>(`/api/san/${encodeURIComponent(props.sanId)}/binary-deployments/${encodeURIComponent(activeJobId.value)}`)
    latest.value = {
      job: res.job,
      target: res.target,
      binary: res.binary ?? selectedBinary.value ?? null,
    }
    if (!isDeploymentJobRunning(res.job.status)) {
      stopPolling()
      await loadLatest()
    }
  } catch {
    stopPolling()
  }
}

async function loadLatest() {
  if (!props.sanId) {
    latest.value = null
    return
  }
  const res = await $fetch<{ latest: SanLatestDeploymentDto }>(
    `/api/san/${encodeURIComponent(props.sanId)}/binary-deployments/latest`,
  )
  latest.value = res.latest
  if (res.latest?.job.id) activeJobId.value = res.latest.job.id
  if (res.latest?.job && isDeploymentJobRunning(res.latest.job.status)) {
    stopPolling()
    pollTimer = setInterval(() => { void pollActiveJob() }, 2000)
  }
}

async function loadCatalog() {
  const res = await $fetch<{ binaries: DeploymentBinaryDto[] }>('/api/admin/deployment/catalog')
  catalog.value = res.binaries
}

async function reload() {
  if (!props.sanId) return
  loading.value = true
  try {
    await Promise.all([loadCatalog(), loadLatest()])
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    loading.value = false
  }
}

async function deploy() {
  if (!props.sanId || !selectedBinaryId.value) return
  deploying.value = true
  stopPolling()
  try {
    const res = await $fetch<{ job: { id: string } }>(
      `/api/san/${encodeURIComponent(props.sanId)}/binary-deployments`,
      { method: 'POST', body: { binaryId: selectedBinaryId.value } },
    )
    activeJobId.value = res.job.id
    toast.success(t('admin.deployment.san.deploy_started') as string)
    pollTimer = setInterval(() => { void pollActiveJob() }, 2000)
    void pollActiveJob()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    deploying.value = false
  }
}

async function retry() {
  if (!props.sanId || !latest.value?.job.id) return
  retrying.value = true
  stopPolling()
  try {
    await $fetch(
      `/api/san/${encodeURIComponent(props.sanId)}/binary-deployments/${encodeURIComponent(latest.value.job.id)}/retry`,
      { method: 'POST' },
    )
    activeJobId.value = latest.value.job.id
    pollTimer = setInterval(() => { void pollActiveJob() }, 2000)
    void pollActiveJob()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    retrying.value = false
  }
}

function resetForSanChange() {
  stopPolling()
  selectedBinaryId.value = null
  latest.value = null
  activeJobId.value = null
}

watch(() => props.sanId, (id, prev) => {
  if (id === prev) return
  resetForSanChange()
  if (id) void reload()
}, { immediate: true })

onUnmounted(() => stopPolling())
</script>
