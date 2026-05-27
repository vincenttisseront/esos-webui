<template>
  <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{ title }}</h3>
        <p class="text-xs text-gray-400">{{ seriesCountLabel }}</p>
      </div>
      <div v-if="scopeReady" class="flex items-center gap-3">
        <div class="flex gap-1">
          <button
            class="px-2 py-1 text-xs rounded"
            :class="metric === 'read_kbps' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'"
            @click="metric = 'read_kbps'"
          >
            Read
          </button>
          <button
            class="px-2 py-1 text-xs rounded"
            :class="metric === 'write_kbps' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'"
            @click="metric = 'write_kbps'"
          >
            Write
          </button>
        </div>
        <TimeWindowSelector v-model="window" />
      </div>
    </div>

    <UAlert
      v-if="!scopeReady"
      color="blue"
      variant="soft"
      :title="t('monitoring.history.scope_required_title')"
      :description="t('monitoring.history.scope_required_desc')"
    />
    <UAlert
      v-else-if="emptyReason"
      color="amber"
      variant="soft"
      :title="t('monitoring.history.empty.title')"
      :description="t(historyEmptyReasonKey(emptyReason))"
    />
    <Line
      v-else-if="chartData"
      :data="chartData"
      :options="chartOptions"
      class="max-h-64"
    />
    <p v-else class="text-center text-xs text-gray-400 py-8 italic">
      {{ t('monitoring.history.empty.no_series') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import type { MetricPoint } from '~/server/db/repositories/metrics.repository'
import { useChartTheme } from '~/utils/chart-theme'
import { historyEmptyReasonKey, kbpsTooltipLabel } from '~/utils/metrics-display'
import type { HistoryMetaResponse } from '~/composables/useMetricsHistoryScope'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const props = defineProps<{
  title: string
  category: 'session' | 'device'
  meta?: HistoryMetaResponse | null
}>()

const window = defineModel<string>('window', { default: '1h' })

const { t } = useEsosI18n()
const { scopeReady, historyParams } = useMetricsHistoryScope()

const metric = ref<string>('read_kbps')

const COLORS = [
  '#3b82f6', '#f97316', '#10b981', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f59e0b', '#ec4899',
]

const endpoint = computed(() =>
  props.category === 'device' ? '/api/history/devices' : '/api/history/sessions',
)

const fetchKey = computed(() => {
  const p = historyParams({ window: window.value, metric: metric.value })
  if (!p) return null
  return `${endpoint.value}?${new URLSearchParams(p).toString()}`
})

const { data: raw } = await useAsyncData(
  () => `history-io-${props.category}-${fetchKey.value ?? 'idle'}`,
  () => (fetchKey.value ? $fetch(fetchKey.value) : Promise.resolve(null)),
  { watch: [fetchKey] },
)

const emptyReason = computed(() => {
  if (!scopeReady.value) return null
  const series = (raw.value as { series?: unknown[] })?.series
  if (series?.length) return null
  if (!props.meta?.samples.totalCount) {
    return props.meta?.emptyReason ?? 'no_samples_yet'
  }
  return 'range_empty'
})

const seriesCount = computed(() => (raw.value as { series?: unknown[] })?.series?.length ?? 0)

const seriesCountLabel = computed(() =>
  props.category === 'device'
    ? t('monitoring.history.device_series_count', { n: seriesCount.value })
    : t('monitoring.history.session_series_count', { n: seriesCount.value }),
)

const chartData = computed(() => {
  if (!scopeReady.value || emptyReason.value) return null
  const rawVal = raw.value as { series?: Array<{ subject: string; points: MetricPoint[] }> }
  if (!rawVal?.series?.length) return null

  const allTs = [
    ...new Set<number>(
      rawVal.series.flatMap(s => s.points.map(p => p.timestamp)),
    ),
  ].sort((a, b) => a - b)
  if (!allTs.length) return null

  const labels = allTs.map(ts =>
    new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  )

  const datasets = rawVal.series.map((serie, i) => {
    const color = COLORS[i % COLORS.length]
    const pointMap = new Map<number, number>(
      serie.points.map(p => [p.timestamp, p.value]),
    )
    return {
      label: props.category === 'session' ? shortWwn(serie.subject) : serie.subject,
      data: allTs.map(ts => pointMap.get(ts) ?? null),
      borderColor: color,
      backgroundColor: color + '20',
      borderWidth: 1.5,
      pointRadius: 0,
      spanGaps: true,
      fill: false,
      tension: 0.3,
    }
  })

  return { labels, datasets }
})

const chartTheme = useChartTheme()

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        font: { family: 'JetBrains Mono', size: 10 },
        boxWidth: 12,
        color: chartTheme.value.legend,
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; raw: unknown }) =>
          kbpsTooltipLabel(ctx.raw as number | null, ctx.dataset.label ?? ''),
      },
    },
  },
  scales: {
    x: {
      ticks: { font: { size: 10 }, maxTicksLimit: 8, color: chartTheme.value.tick },
      grid: { display: false },
    },
    y: {
      ticks: {
        font: { size: 10 },
        color: chartTheme.value.tick,
        callback: (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(0)}M` : `${v}K`),
      },
      grid: { color: chartTheme.value.grid },
    },
  },
}))

function shortWwn(wwn: string): string {
  return wwn.split(':').slice(-2).join(':')
}
</script>
