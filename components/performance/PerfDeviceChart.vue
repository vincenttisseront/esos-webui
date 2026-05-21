<template>
  <div class="relative">
    <Line v-if="chartData" :data="chartData" :options="chartOptions" class="max-h-64" />
    <div v-else class="h-40 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
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
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js'
import type { PerfDeviceSeries } from '~/server/utils/perf-agent-types'
import { buildChartJsOptions, useChartTheme } from '~/utils/chart-theme'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, Filler)

const props = defineProps<{ series: PerfDeviceSeries | null }>()
const chartTheme = useChartTheme()

function fmtKbps(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} GB/s`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)} MB/s`
  return `${Math.round(v)} KB/s`
}

const chartData = computed(() => {
  const pts = props.series?.points
  const t = chartTheme.value
  if (!pts?.length) return null
  const labels = pts.map(p => new Date(p.t).toLocaleTimeString())
  return {
    labels,
    datasets: [
      {
        label: 'Lecture',
        data: pts.map(p => p.readKbps),
        borderColor: t.readBorder,
        backgroundColor: t.readFill,
        tension: 0.3,
        fill: true,
        pointRadius: pts.length > 100 ? 0 : 2,
      },
      {
        label: 'Écriture',
        data: pts.map(p => p.writeKbps),
        borderColor: t.writeBorder,
        backgroundColor: t.writeFill,
        tension: 0.3,
        fill: true,
        pointRadius: pts.length > 100 ? 0 : 2,
      },
      {
        label: 'Total',
        data: pts.map(p => p.deviceRateKbps),
        borderColor: t.neutralBorder,
        borderDash: [4, 4],
        tension: 0.3,
        fill: false,
        pointRadius: 0,
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
            ` ${ctx.dataset.label}: ${fmtKbps(Number(ctx.raw))}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          font: { size: 10 },
          color: chartTheme.value.tick,
          callback: (v: string | number) => fmtKbps(Number(v)),
        },
        grid: { color: chartTheme.value.grid },
      },
    },
  }),
)
</script>
