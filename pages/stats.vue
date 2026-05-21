<script setup lang="ts">
definePageMeta({ layout: 'default' })

const stats = useStatsStore()
const ssh = useSSHStore()
const perf = usePerfStore()
const { t } = useEsosI18n()

const { selectedId, isAll, effective } = useSelectedSan()

// ── Onglet actif ──────────────────────────────────────────────────────────
const route = useRoute()
const router = useRouter()
const activeTab = computed({
  get: () => (route.query.tab as string) ?? 'io',
  set: (v) => router.replace({ query: { ...route.query, tab: v } }),
})

const tabs = computed(() => [
  { key: 'io',   label: t('monitoring.stats.tab_io'), icon: 'i-heroicons-chart-bar'   },
  { key: 'perf', label: t('monitoring.stats.tab_perf'), icon: 'i-heroicons-bolt'         },
])

// Perf-agent ciblé sur le SAN effectif (inclut le primaire quand un cluster est sélectionné)
watch(
  () => effective.value?.id,
  async (sanId) => {
    perf.sanId = sanId ?? null
    perf.stopPolling()
    if (!sanId) return
    await perf.fetchConfig()
    if (perf.config?.system) perf.selectedSystem = perf.config.system
    perf.startPolling(30_000)
  },
  { immediate: true },
)

// ── Polling I/O ───────────────────────────────────────────────────────────
onMounted(() => {
  stats.startPolling(10_000)
})

onUnmounted(() => {
  stats.stopPolling()
  perf.stopPolling()
})

watch([selectedId, isAll, () => effective.value?.id], () => {
  stats.reset()
  stats.startPolling(10_000)
})

const lastRefreshLabel = computed(() => {
  if (!stats.capturedAt) return '—'
  return new Date(stats.capturedAt).toLocaleTimeString()
})

const lastSampleLabel = computed(() => {
  const latest = perf.devices.reduce((max, d) => Math.max(max, d.lastSampleAt), 0)
  if (!latest) return ''
  return t('monitoring.stats.last_sample', { time: new Date(latest).toLocaleTimeString() })
})

async function selectDevice(device: string) {
  perf.selectedDevice = device
  await perf.fetchSeries()
}

async function onSystemChange() {
  perf.selectedDevice = ''
  perf.series = null
  await perf.refreshDashboard()
}
</script>

<template>
  <div class="p-6 space-y-6">

    <!-- En-tête global -->
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ t('monitoring.stats.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('monitoring.stats.subtitle') }}</p>
      </div>
    </header>

    <!-- Onglets -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex gap-1">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors"
          :class="activeTab === tab.key
            ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400 -mb-px'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = tab.key"
        >
          <UIcon :name="tab.icon" class="w-4 h-4" />
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- ══ Onglet I/O ══════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'io'">
      <!-- Barre de contrôle -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <UBadge :color="ssh.isReady ? 'green' : 'red'" size="xs">
            {{ t(ssh.statusKey) }}
          </UBadge>
          <span class="text-xs text-gray-400">{{ t('monitoring.stats.last_read', { time: lastRefreshLabel }) }}</span>
        </div>
        <UButton
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="stats.loading"
          size="sm"
          @click="stats.fetchAll()"
        />
      </div>

      <!-- Alerte SSH -->
      <UAlert
        v-if="!ssh.isReady"
        color="orange"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :title="t('monitoring.stats.ssh_unavailable_title')"
        :description="t('monitoring.stats.ssh_unavailable_desc')"
      />

      <!-- Alerte erreur -->
      <UAlert
        v-if="stats.error"
        color="red"
        variant="soft"
        icon="i-heroicons-x-circle"
        :title="stats.error"
      />

      <!-- Contenu -->
      <ThroughputBar />
      <SessionStatsTable />
      <DeviceStatsTable />
      <DiskStatsTable />
    </template>

    <!-- ══ Onglet Performance ═════════════════════════════════════════════ -->
    <template v-else-if="activeTab === 'perf'">
      <!-- Barre de contrôle -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <USelect
            v-if="perf.devices.length"
            v-model="perf.selectedSystem"
            :options="[]"
            size="sm"
            :placeholder="t('monitoring.stats.system_placeholder')"
            class="w-40"
            @change="onSystemChange"
          />
          <PerfWindowSelector
            v-model="perf.selectedWindow"
            @update:model-value="perf.fetchSeries()"
          />
        </div>
        <div class="flex items-center gap-2">
          <span v-if="perf.devices.length" class="text-xs text-gray-400">{{ lastSampleLabel }}</span>
          <UButton
            size="sm"
            :loading="perf.loading"
            icon="i-heroicons-arrow-path"
            variant="ghost"
            color="gray"
            @click="perf.refreshDashboard()"
          />
        </div>
      </div>

      <!-- Alertes diagnostics -->
      <UAlert
        v-if="perf.service && !perf.service.running"
        color="orange"
        icon="i-heroicons-exclamation-triangle"
        :title="t('monitoring.stats.agent_stopped_title')"
        :description="t('monitoring.stats.agent_stopped_desc')"
        :actions="[{ label: t('monitoring.stats.go_to_sans'), to: '/admin/sans' }]"
      />
      <UAlert
        v-if="!perf.isConfigured"
        color="blue"
        icon="i-heroicons-information-circle"
        :title="t('monitoring.stats.agent_not_configured_title')"
        :description="t('monitoring.stats.agent_not_configured_desc')"
        :actions="[{ label: t('monitoring.stats.configure'), to: '/admin/sans' }]"
      />
      <UAlert
        v-if="perf.hasStaleDevices && !perf.loading"
        color="orange"
        icon="i-heroicons-clock"
        :description="t('monitoring.stats.stale_devices')"
      />
      <UAlert
        v-if="perf.series && perf.series.points.length === 0 && !perf.loading"
        color="gray"
        icon="i-heroicons-chart-bar"
        :description="t('monitoring.stats.no_samples', { window: perf.selectedWindow })"
      />
      <UAlert
        v-if="perf.error"
        color="red"
        icon="i-heroicons-x-circle"
        :description="perf.error"
        @close="perf.error = null"
      />

      <!-- KPIs -->
      <PerfSummaryCard :devices="perf.devices" />

      <!-- Charts -->
      <div v-if="perf.devices.length > 0 || perf.series" class="space-y-4">
        <!-- Sélecteur device -->
        <div class="flex gap-2 flex-wrap">
          <UButton
            v-for="d in perf.devices"
            :key="d.device"
            size="xs"
            :color="perf.selectedDevice === d.device ? 'primary' : 'gray'"
            :variant="perf.selectedDevice === d.device ? 'solid' : 'ghost'"
            :label="d.device"
            @click="selectDevice(d.device)"
          />
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {{ t('monitoring.stats.throughput_title') }}
              <span v-if="perf.selectedDevice" class="font-mono text-primary-500 ml-1">{{ perf.selectedDevice }}</span>
            </h2>
            <span class="text-xs text-gray-400">{{ perf.selectedWindow }}</span>
          </div>
          <ClientOnly>
            <PerfDeviceChart :series="perf.series" />
          </ClientOnly>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">{{ t('monitoring.stats.latency_title') }}</h2>
            <div class="flex gap-3 text-xs text-gray-400">
              <span class="text-green-600">{{ t('monitoring.stats.latency_normal') }}</span>
              <span class="text-orange-500">{{ t('monitoring.stats.latency_warning') }}</span>
              <span class="text-red-600">{{ t('monitoring.stats.latency_critical') }}</span>
            </div>
          </div>
          <ClientOnly>
            <PerfLatencyChart :series="perf.series" />
          </ClientOnly>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">{{ t('monitoring.stats.all_devices') }}</h2>
          </div>
          <PerfDeviceTable
            :devices="perf.devices"
            :selected-device="perf.selectedDevice"
            @select="selectDevice"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="!perf.loading" class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center space-y-3">
        <UIcon name="i-heroicons-chart-bar" class="w-12 h-12 text-gray-300 mx-auto" />
        <p class="text-gray-500 dark:text-gray-400 font-medium">{{ t('monitoring.stats.empty_title') }}</p>
        <ul class="text-sm text-gray-400 space-y-1 text-left max-w-sm mx-auto list-disc pl-5">
          <li>{{ t('monitoring.stats.empty_check_agent') }}</li>
          <li>{{ t('monitoring.stats.empty_check_dburi') }}</li>
          <li>{{ t('monitoring.stats.empty_check_devices') }}</li>
          <li>{{ t('monitoring.stats.empty_check_sample') }}</li>
        </ul>
        <UButton to="/admin/sans" size="sm" color="primary" variant="soft" :label="t('monitoring.stats.configure_from_sans')" />
      </div>
    </template>

  </div>
</template>
