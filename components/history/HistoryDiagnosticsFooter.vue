<template>
  <footer
    v-if="meta"
    class="text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3 mt-2 space-y-1 font-mono"
  >
    <p>{{ t('monitoring.history.diagnostics.title') }}</p>
    <p>
      {{ t('monitoring.history.diagnostics.san') }}:
      <span class="text-gray-700 dark:text-gray-300">{{ meta.sanId }}</span>
      ·
      {{ t('monitoring.history.diagnostics.window') }}:
      {{ meta.window }}
      ({{ fmt(meta.from) }} → {{ fmt(meta.to) }})
    </p>
    <p>
      {{ t('monitoring.history.diagnostics.samples') }}:
      {{ meta.samples.rangeCount.toLocaleString() }}
      /
      {{ meta.samples.totalCount.toLocaleString() }}
      <template v-if="meta.samples.rangeNewestAt">
        · {{ t('monitoring.history.diagnostics.last_sample') }}:
        {{ fmt(meta.samples.rangeNewestAt) }}
      </template>
    </p>
    <p>
      {{ t('monitoring.history.diagnostics.collector') }}:
      <template v-if="meta.collector.enabled">
        {{ t('monitoring.history.diagnostics.interval', { sec: meta.collector.intervalSec }) }}
        · {{ t('monitoring.history.diagnostics.retention', { hours: meta.collector.retentionHours }) }}
        <template v-if="meta.collector.lastRunAt">
          · {{ t('monitoring.history.diagnostics.last_run') }}:
          {{ fmt(meta.collector.lastRunAt) }}
        </template>
      </template>
      <template v-else>
        {{ t('monitoring.history.empty.collector_disabled') }}
      </template>
    </p>
    <p v-if="meta.collector.lastError" class="text-amber-600 dark:text-amber-400">
      {{ t('monitoring.history.diagnostics.last_error') }}: {{ meta.collector.lastError }}
    </p>
  </footer>
</template>

<script setup lang="ts">
import type { HistoryMetaResponse } from '~/composables/useMetricsHistoryScope'
import { formatMetricTimestamp } from '~/utils/metrics-display'

defineProps<{
  meta: HistoryMetaResponse | null | undefined
}>()

const { t, locale } = useEsosI18n()

function fmt(ts: number) {
  return formatMetricTimestamp(ts, locale.value)
}
</script>
