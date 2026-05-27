<template>
  <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {{ t('monitoring.history.system_chart_title') }}
      </h3>
      <TimeWindowSelector v-if="scopeReady" v-model="window" />
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
      class="max-h-48"
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
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { useChartTheme } from '~/utils/chart-theme'
import { historyEmptyReasonKey } from '~/utils/metrics-display'
import type { HistoryMetaResponse } from '~/composables/useMetricsHistoryScope'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
)

const props = defineProps<{
  meta?: HistoryMetaResponse | null
}>()

const window = defineModel<string>('window', { default: '1h' })

const { t } = useEsosI18n()
const { scopeReady, historyParams } = useMetricsHistoryScope()

const fetchKey = computed(() => {
  const p = historyParams({ window: window.value })
  if (!p) return null
  return `/api/history/system?${new URLSearchParams(p).toString()}`
})

const { data: raw } = await useAsyncData(
  () => `history-system-${fetchKey.value ?? 'idle'}`,
  () => (fetchKey.value ? $fetch(fetchKey.value) : Promise.resolve(null)),
  { watch: [fetchKey] },
)

type Point = { timestamp: number; value: number }

const emptyReason = computed(() => {
  if (!scopeReady.value) return null
  const cpu = (raw.value as { series?: { cpu?: Point[] } })?.series?.cpu ?? []
  const ram = (raw.value as { series?: { ram?: Point[] } })?.series?.ram ?? []
  if (cpu.length || ram.length) return null
  if (!props.meta?.samples.totalCount) {
    return props.meta?.emptyReason ?? 'no_samples_yet'
  }
  return 'range_empty'
})

const chartData = computed(() => {
  if (!scopeReady.value || emptyReason.value) return null
  const rawVal = raw.value as { series?: { cpu?: Point[]; ram?: Point[] } }
  const cpu = rawVal?.series?.cpu ?? []
  const ram = rawVal?.series?.ram ?? []
  const allTs = [
    ...new Set<number>([...cpu.map(p => p.timestamp), ...ram.map(p => p.timestamp)]),
  ].sort((a, b) => a - b)
  if (!allTs.length) return null

  const labels = allTs.map(ts =>
    new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  )
  const cpuMap = new Map<number, number>(cpu.map(p => [p.timestamp, p.value]))
  const ramMap = new Map<number, number>(ram.map(p => [p.timestamp, p.value]))

  return {
    labels,
    datasets: [
      {
        label: t('monitoring.history.cpu_pct'),
        data: allTs.map(ts => cpuMap.get(ts) ?? null),
        borderColor: '#6366f1',
        backgroundColor: '#6366f120',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: true,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: t('monitoring.history.ram_pct'),
        data: allTs.map(ts => ramMap.get(ts) ?? null),
        borderColor: '#10b981',
        backgroundColor: '#10b98120',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: true,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  }
})

const chartTheme = useChartTheme()

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: { color: chartTheme.value.legend },
    },
  },
  scales: {
    y: {
      min: 0,
      max: 100,
      ticks: { callback: (v: number) => `${v}%`, color: chartTheme.value.tick },
      grid: { color: chartTheme.value.grid },
    },
    x: {
      ticks: { maxTicksLimit: 8, font: { size: 10 }, color: chartTheme.value.tick },
      grid: { display: false },
    },
  },
}))
</script>
