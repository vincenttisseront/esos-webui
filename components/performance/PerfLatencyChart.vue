<template>
  <div class="relative">
    <Line v-if="chartData" :data="chartData" :options="chartOptions" class="max-h-48" />
    <div v-else class="h-32 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
      Aucune donnée à afficher
    </div>
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
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js'
import type { PerfDeviceSeries } from '~/server/utils/perf-agent-types'
import { buildChartJsOptions, useChartTheme } from '~/utils/chart-theme'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Legend)

const props = defineProps<{ series: PerfDeviceSeries | null }>()
const chartTheme = useChartTheme()

const chartData = computed(() => {
  const pts = props.series?.points
  const t = chartTheme.value
  if (!pts?.length) return null
  const labels = pts.map(p => new Date(p.t).toLocaleTimeString())
  return {
    labels,
    datasets: [
      {
        label: 'Latence lecture',
        data: pts.map(p => p.averageReadTimeMs),
        borderColor: '#8b5cf6',
        tension: 0.3,
        pointRadius: pts.length > 100 ? 0 : 2,
      },
      {
        label: 'Latence écriture',
        data: pts.map(p => p.averageWriteTimeMs),
        borderColor: t.writeBorder,
        tension: 0.3,
        pointRadius: pts.length > 100 ? 0 : 2,
      },
    ],
  }
})

const chartOptions = computed(() =>
  buildChartJsOptions(chartTheme.value, {
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; raw: unknown }) =>
            ` ${ctx.dataset.label}: ${Number(ctx.raw).toFixed(2)} ms`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          font: { size: 10 },
          color: chartTheme.value.tick,
          callback: (v: string | number) => `${v} ms`,
        },
        grid: { color: chartTheme.value.grid },
      },
    },
  }),
)
</script>
