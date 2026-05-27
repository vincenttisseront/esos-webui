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

        <template v-else-if="ctx">
          <div
            v-if="ctx.controllerDetected && ctx.controllerModel"
            class="text-xs text-gray-500 space-y-1"
          >
            <p>
              <span class="font-medium">{{ t('admin.deployment.san.hardware_detected') }}:</span>
              {{ ctx.controllerModel }}
              <span v-if="ctx.controllerVendor" class="text-gray-400">({{ ctx.controllerVendor }})</span>
            </p>
          </div>

          <UAlert
            v-if="!ctx.hardwareKnown"
            color="amber"
            variant="subtle"
            :title="t('admin.deployment.san.unknown_hardware_title') as string"
            :description="t('admin.deployment.san.unknown_hardware_hint') as string"
          />

          <div v-if="ctx.installedCompatible.length" class="space-y-2">
            <p class="text-xs font-medium text-gray-500 uppercase">
              {{ t('admin.deployment.san.installed_tools') }}
            </p>
            <div
              v-for="item in ctx.installedCompatible"
              :key="item.toolGroup"
              class="flex items-center justify-between gap-2 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20 px-3 py-2 text-sm"
            >
              <div>
                <span class="font-medium text-green-800 dark:text-green-300">{{ item.label }}</span>
                <span v-if="item.version" class="text-gray-500 text-xs ml-2">{{ item.version }}</span>
                <p v-if="item.path" class="text-xs text-gray-400 font-mono truncate">{{ item.path }}</p>
              </div>
              <UBadge color="green" size="xs">{{ t('admin.deployment.san.already_installed') }}</UBadge>
            </div>
          </div>

          <UAlert
            v-if="ctx.hardwareKnown && !ctx.missingToolGroups.length"
            color="green"
            variant="subtle"
            :title="t('admin.deployment.san.no_binary_required') as string"
          />

          <template v-if="ctx.hardwareKnown && ctx.primaryDeployables.length">
            <AppFormField :label="t('admin.deployment.san.select_binary') as string">
              <USelectMenu
                v-model="selectedBinaryId"
                :items="primaryBinaryItems"
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
                @click="confirmDeployOpen = true"
              >
                {{ t('admin.deployment.san.deploy') }}
              </UButton>
              <UButton
                icon="i-heroicons-arrow-path"
                color="gray"
                variant="outline"
                size="sm"
                :loading="loading"
                :disabled="deploymentInProgress"
                @click="reload"
              >
                {{ t('admin.deployment.page.refresh') }}
              </UButton>
            </div>
          </template>

          <div v-else-if="ctx.hardwareKnown && !ctx.primaryDeployables.length" class="flex flex-wrap gap-2">
            <UButton
              icon="i-heroicons-arrow-path"
              color="gray"
              variant="outline"
              size="sm"
              :loading="loading"
              :disabled="deploymentInProgress"
              @click="reload"
            >
              {{ t('admin.deployment.page.refresh') }}
            </UButton>
          </div>

          <details v-if="showAdvancedSection" class="rounded-lg border border-gray-200 dark:border-gray-700">
            <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400">
              {{ t('admin.deployment.san.advanced_title') }}
            </summary>
            <div class="px-3 pb-3 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
              <UAlert
                v-if="!ctx.hardwareKnown"
                color="amber"
                variant="subtle"
                size="sm"
                :title="t('admin.deployment.san.manual_warning') as string"
              />
              <template v-if="advancedDeployables.length">
                <AppFormField :label="t('admin.deployment.san.advanced_select') as string">
                  <USelectMenu
                    v-model="advancedBinaryId"
                    :items="advancedBinaryItems"
                    value-key="value"
                    label-key="label"
                    :disabled="isDisabled"
                    :placeholder="t('admin.deployment.san.select_placeholder') as string"
                    class="w-full"
                  />
                </AppFormField>
                <UButton
                  icon="i-heroicons-arrow-path"
                  color="amber"
                  variant="outline"
                  size="sm"
                  :loading="deploying"
                  :disabled="!canAdvancedDeploy"
                  @click="confirmAdvancedOpen = true"
                >
                  {{ t('admin.deployment.san.reinstall') }}
                </UButton>
              </template>
              <p v-else class="text-sm text-gray-500">{{ t('admin.deployment.san.advanced_empty') }}</p>
            </div>
          </details>

          <details v-if="ctx.otherCatalogBinaries.length" class="rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            <summary class="cursor-pointer px-3 py-2 text-sm text-gray-500">
              {{ t('admin.deployment.san.other_catalog', { count: ctx.otherCatalogBinaries.length }) }}
            </summary>
            <ul class="px-3 pb-3 text-xs text-gray-500 space-y-1">
              <li v-for="b in ctx.otherCatalogBinaries" :key="b.id" class="font-mono">
                {{ b.name }} ({{ b.filename }})
              </li>
            </ul>
          </details>

          <p
            v-if="!ctx.primaryDeployables.length && !ctx.otherCatalogBinaries.length && !ctx.hardwareKnown"
            class="text-sm text-amber-700 dark:text-amber-300"
          >
            {{ t('admin.deployment.san.empty_catalog') }}
            <NuxtLink to="/admin/binary-deployment" class="text-primary-600 hover:underline ml-1">
              {{ t('admin.deployment.san.catalog_link') }}
            </NuxtLink>
          </p>
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
          <p v-if="latest.target.finishedAt || latest.target.startedAt" class="text-xs text-gray-400">
            {{ latest.target.finishedAt ?? latest.target.startedAt }}
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

    <UModal v-model:open="confirmDeployOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">{{ t('admin.deployment.san.confirm_title') }}</h3>
          <p class="text-sm text-gray-600">
            {{ t('admin.deployment.san.confirm_message', { name: selectedBinary?.name ?? '—' }) }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="outline" @click="confirmDeployOpen = false">
              {{ t('common.actions.cancel') }}
            </UButton>
            <UButton color="primary" :loading="deploying" @click="deploy">
              {{ t('admin.deployment.san.deploy') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="confirmAdvancedOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">{{ t('admin.deployment.san.reinstall_confirm_title') }}</h3>
          <p class="text-sm text-gray-600">
            {{ t('admin.deployment.san.reinstall_confirm_message', { name: advancedBinary?.name ?? '—' }) }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="outline" @click="confirmAdvancedOpen = false">
              {{ t('common.actions.cancel') }}
            </UButton>
            <UButton color="amber" :loading="deploying" @click="deployAdvanced">
              {{ t('admin.deployment.san.reinstall') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
import type { DeploymentBinaryDto, SanLatestDeploymentDto } from '~/types/deployment'
import type { SanBinaryDeploymentContext } from '~/utils/binary-deployment-compatibility'
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
const confirmDeployOpen = ref(false)
const confirmAdvancedOpen = ref(false)
const ctx = ref<SanBinaryDeploymentContext | null>(null)
const selectedBinaryId = ref<string | null>(null)
const advancedBinaryId = ref<string | null>(null)
const latest = ref<SanLatestDeploymentDto>(null)
const activeJobId = ref<string | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const deploymentInProgress = computed(() => {
  if (deploying.value || retrying.value) return true
  if (latest.value?.job && isDeploymentJobRunning(latest.value.job.status)) return true
  return false
})

const isDisabled = computed(() =>
  Boolean(props.disabled) || !props.sanId || deploymentInProgress.value,
)

const primaryBinaryItems = computed(() =>
  (ctx.value?.primaryDeployables ?? []).map(e => ({
    value: e.binary.id,
    label: e.binary.version ? `${e.binary.name} (${e.binary.version})` : e.binary.name,
  })),
)

const advancedDeployables = computed(() => {
  if (!ctx.value) return []
  if (!ctx.value.hardwareKnown) {
    return ctx.value.primaryDeployables.length
      ? []
      : ctx.value.advancedDeployables
  }
  return ctx.value.advancedDeployables
})

const advancedBinaryItems = computed(() =>
  advancedDeployables.value.map(e => ({
    value: e.binary.id,
    label: e.binary.version ? `${e.binary.name} (${e.binary.version})` : e.binary.name,
  })),
)

const showAdvancedSection = computed(() => {
  if (!ctx.value) return false
  if (!ctx.value.hardwareKnown) return advancedDeployables.value.length > 0
  return ctx.value.advancedDeployables.length > 0
    || (!ctx.value.primaryDeployables.length && ctx.value.otherCatalogBinaries.length > 0)
})

const selectedBinary = computed(() =>
  ctx.value?.primaryDeployables.find(e => e.binary.id === selectedBinaryId.value)?.binary ?? null,
)

const advancedBinary = computed(() =>
  advancedDeployables.value.find(e => e.binary.id === advancedBinaryId.value)?.binary ?? null,
)

const canDeploy = computed(() =>
  Boolean(props.sanId)
  && Boolean(selectedBinaryId.value)
  && Boolean(selectedBinary.value)
  && !props.disabled
  && !deploymentInProgress.value,
)

const canAdvancedDeploy = computed(() =>
  Boolean(props.sanId)
  && Boolean(advancedBinaryId.value)
  && Boolean(advancedBinary.value)
  && !props.disabled
  && !deploymentInProgress.value,
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
      binary: res.binary ?? selectedBinary.value ?? advancedBinary.value ?? null,
    }
    if (!isDeploymentJobRunning(res.job.status)) {
      stopPolling()
      await reload()
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

async function loadContext() {
  if (!props.sanId) {
    ctx.value = null
    return
  }
  const res = await $fetch<{ context: SanBinaryDeploymentContext }>(
    `/api/san/${encodeURIComponent(props.sanId)}/binary-deployments/context`,
  )
  ctx.value = res.context
  const primaryIds = new Set(res.context.primaryDeployables.map(e => e.binary.id))
  if (selectedBinaryId.value && !primaryIds.has(selectedBinaryId.value)) {
    selectedBinaryId.value = null
  }
  if (!selectedBinaryId.value && res.context.primaryDeployables.length === 1) {
    selectedBinaryId.value = res.context.primaryDeployables[0]!.binary.id
  }
}

async function reload() {
  if (!props.sanId) return
  loading.value = true
  try {
    await Promise.all([loadContext(), loadLatest()])
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    loading.value = false
  }
}

async function runDeploy(binaryId: string) {
  const res = await $fetch<{ job: { id: string } }>(
    `/api/san/${encodeURIComponent(props.sanId)}/binary-deployments`,
    { method: 'POST', body: { binaryId } },
  )
  activeJobId.value = res.job.id
  toast.success(t('admin.deployment.san.deploy_started') as string)
  pollTimer = setInterval(() => { void pollActiveJob() }, 2000)
  void pollActiveJob()
}

async function deploy() {
  if (!props.sanId || !selectedBinaryId.value) return
  deploying.value = true
  confirmDeployOpen.value = false
  stopPolling()
  try {
    await runDeploy(selectedBinaryId.value)
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    deploying.value = false
  }
}

async function deployAdvanced() {
  if (!props.sanId || !advancedBinaryId.value) return
  deploying.value = true
  confirmAdvancedOpen.value = false
  stopPolling()
  try {
    await runDeploy(advancedBinaryId.value)
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
  advancedBinaryId.value = null
  latest.value = null
  activeJobId.value = null
  ctx.value = null
}

watch(() => props.sanId, (id, prev) => {
  if (id === prev) return
  resetForSanChange()
  if (id) void reload()
}, { immediate: true })

onUnmounted(() => stopPolling())
</script>
