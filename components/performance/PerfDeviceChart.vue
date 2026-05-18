<template>
  <div class="relative">
    <Line v-if="chartData" :data="chartData" :options="chartOptions" class="max-h-64" />
    <div v-else class="h-40 flex items-center justify-center text-sm text-gray-400">
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, Filler)

const props = defineProps<{ series: PerfDeviceSeries | null }>()

function fmtKbps(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} GB/s`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)} MB/s`
  return `${Math.round(v)} KB/s`
}

const chartData = computed(() => {
  const pts = props.series?.points
  if (!pts?.length) return null
  const labels = pts.map(p => new Date(p.t).toLocaleTimeString())
  return {
    labels,
    datasets: [
      {
        label: 'Lecture',
        data: pts.map(p => p.readKbps),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        tension: 0.3,
        fill: true,
        pointRadius: pts.length > 100 ? 0 : 2,
      },
      {
        label: 'Écriture',
        data: pts.map(p => p.writeKbps),
        borderColor: '#f97316',
        backgroundColor: 'rgba(249,115,22,0.08)',
        tension: 0.3,
        fill: true,
        pointRadius: pts.length > 100 ? 0 : 2,
      },
      {
        label: 'Total',
        data: pts.map(p => p.deviceRateKbps),
        borderColor: '#9ca3af',
        borderDash: [4, 4],
        tension: 0.3,
        fill: false,
        pointRadius: 0,
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
        label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtKbps(ctx.raw)}`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        font: { size: 10 },
        callback: (v: any) => fmtKbps(Number(v)),
      },
    },
    x: {
      ticks: { font: { size: 10 }, maxTicksLimit: 8 },
    },
  },
}
</script>
