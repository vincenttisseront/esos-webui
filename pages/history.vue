<template>
  <div class="space-y-6 p-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold">{{ t('monitoring.history.page_title') }}</h1>
        <p v-if="oldestSampleLabel" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {{ t('monitoring.history.oldest_sample', { time: oldestSampleLabel }) }}
        </p>
        <p v-else-if="scopeReady && meta?.collector.enabled" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">
          {{ t('monitoring.history.waiting_first_sample', { sec: meta.collector.intervalSec }) }}
        </p>
      </div>
    </div>

    <IOTimeSeriesChart
      v-model:window="window"
      :title="t('monitoring.history.sessions_chart_title')"
      category="session"
      :meta="meta ?? undefined"
    />

    <IOTimeSeriesChart
      v-model:window="window"
      :title="t('monitoring.history.devices_chart_title')"
      category="device"
      :meta="meta ?? undefined"
    />

    <SystemTimeSeriesChart v-model:window="window" :meta="meta ?? undefined" />

    <HistoryDiagnosticsFooter :meta="meta" />
  </div>
</template>

<script setup lang="ts">
import HistoryDiagnosticsFooter from '~/components/history/HistoryDiagnosticsFooter.vue'
import type { HistoryMetaResponse } from '~/composables/useMetricsHistoryScope'
import { formatMetricTimestamp } from '~/utils/metrics-display'

definePageMeta({ layout: 'default' })

const { t, locale } = useEsosI18n()
const { scopeReady, historyParams } = useMetricsHistoryScope()

const window = ref('1h')

const metaKey = computed(() => {
  const p = historyParams({ window: window.value })
  if (!p) return null
  return `/api/history/meta?${new URLSearchParams(p).toString()}`
})

const { data: meta } = await useAsyncData(
  () => `history-meta-${metaKey.value ?? 'idle'}`,
  () => (metaKey.value ? $fetch<HistoryMetaResponse>(metaKey.value) : Promise.resolve(null)),
  { watch: [metaKey] },
)

const oldestSampleLabel = computed(() => {
  const ts = meta.value?.samples.oldestAt
  if (!ts) return null
  return formatMetricTimestamp(ts, locale.value)
})
</script>
