<template>
  <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{ title }}</h3>
        <p class="text-xs text-gray-400">{{ seriesCount }} initiateurs actifs</p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Toggle Read / Write -->
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

    <Line
      v-if="chartData"
      :data="chartData"
      :options="chartOptions"
      class="max-h-64"
    />
    <p v-else class="text-center text-xs text-gray-400 py-8 italic">
      Pas encore de données historiques (collecte toutes les 30s)
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

const props = defineProps<{ title: string }>()

const window = ref<string>('1h')
const metric = ref<string>('read_kbps')

const COLORS = [
  '#3b82f6', '#f97316', '#10b981', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f59e0b', '#ec4899',
]

const { data: raw } = await useFetch(
  () => `/api/history/sessions?window=${window.value}&metric=${metric.value}`,
  { watch: [window, metric] },
)

const seriesCount = computed(() => (raw.value as any)?.series?.length ?? 0)

const chartData = computed(() => {
  const rawVal = raw.value as any
  if (!rawVal?.series?.length) return null

  const allTs = [
    ...new Set<number>(
      rawVal.series.flatMap((s: any) =>
        s.points.map((p: MetricPoint) => p.timestamp),
      ),
    ),
  ].sort((a, b) => a - b)

  const labels = allTs.map((ts) =>
    new Date(ts).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  )

  const datasets = rawVal.series.map((serie: any, i: number) => {
    const color    = COLORS[i % COLORS.length]
    const pointMap = new Map<number, number>(
      serie.points.map((p: MetricPoint) => [p.timestamp, p.value]),
    )
    const dataPoints = allTs.map((ts) => pointMap.get(ts) ?? null)

    return {
      label:           shortWwn(serie.subject),
      data:            dataPoints,
      borderColor:     color,
      backgroundColor: color + '20',
      borderWidth:     1.5,
      pointRadius:     0,
      spanGaps:        true,
      fill:            false,
      tension:         0.3,
    }
  })

  return { labels, datasets }
})

const chartTheme = useChartTheme()

const chartOptions = computed(() => ({
  responsive:          true,
  maintainAspectRatio: false,
  animation:           false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels:   {
        font: { family: 'JetBrains Mono', size: 10 },
        boxWidth: 12,
        color: chartTheme.value.legend,
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const kbps = ctx.raw as number | null
          if (kbps == null) return ''
          if (kbps >= 1_048_576) return `${ctx.dataset.label}: ${(kbps / 1_048_576).toFixed(1)} GB/s`
          if (kbps >= 1_024)     return `${ctx.dataset.label}: ${(kbps / 1_024).toFixed(1)} MB/s`
          return `${ctx.dataset.label}: ${kbps.toFixed(0)} KB/s`
        },
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
