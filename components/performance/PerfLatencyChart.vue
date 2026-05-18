<template>
  <div class="relative">
    <Line v-if="chartData" :data="chartData" :options="chartOptions" class="max-h-48" />
    <div v-else class="h-32 flex items-center justify-center text-sm text-gray-400">
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Legend)

const props = defineProps<{ series: PerfDeviceSeries | null }>()

const chartData = computed(() => {
  const pts = props.series?.points
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
        borderColor: '#ef4444',
        tension: 0.3,
        pointRadius: pts.length > 100 ? 0 : 2,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { position: 'top' as const, labels: { boxWidth: 12, font: { size: 11 } } },
    tooltip: {
      callbacks: {
        label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)} ms`,
      },
    },
    // Seuils visuels via annotation plugin (optionnel, non requis)
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        font: { size: 10 },
        callback: (v: any) => `${v} ms`,
      },
    },
    x: {
      ticks: { font: { size: 10 }, maxTicksLimit: 8 },
    },
  },
}
</script>
