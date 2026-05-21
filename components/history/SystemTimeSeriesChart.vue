<template>
  <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">CPU &amp; Mémoire</h3>
      <TimeWindowSelector v-model="window" />
    </div>

    <Line
      v-if="chartData"
      :data="chartData"
      :options="chartOptions"
      class="max-h-48"
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
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { useChartTheme } from '~/utils/chart-theme'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
)

const window = ref<string>('1h')

const { data: raw } = await useFetch(
  () => `/api/history/system?window=${window.value}`,
  { watch: [window] },
)

const chartData = computed(() => {
  const rawVal = raw.value as any
  if (!rawVal) return null
  const { cpu, ram } = rawVal.series as {
    cpu: { timestamp: number; value: number }[]
    ram: { timestamp: number; value: number }[]
  }

  const allTs = [
    ...new Set<number>([
      ...cpu.map((p) => p.timestamp),
      ...ram.map((p) => p.timestamp),
    ]),
  ].sort((a, b) => a - b)

  const labels  = allTs.map((ts) =>
    new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  )
  const cpuMap  = new Map<number, number>(cpu.map((p) => [p.timestamp, p.value]))
  const ramMap  = new Map<number, number>(ram.map((p) => [p.timestamp, p.value]))

  return {
    labels,
    datasets: [
      {
        label:           'CPU %',
        data:            allTs.map((ts) => cpuMap.get(ts) ?? null),
        borderColor:     '#6366f1',
        backgroundColor: '#6366f120',
        borderWidth:     1.5,
        pointRadius:     0,
        fill:            true,
        tension:         0.3,
        spanGaps:        true,
      },
      {
        label:           'RAM %',
        data:            allTs.map((ts) => ramMap.get(ts) ?? null),
        borderColor:     '#10b981',
        backgroundColor: '#10b98120',
        borderWidth:     1.5,
        pointRadius:     0,
        fill:            true,
        tension:         0.3,
        spanGaps:        true,
      },
    ],
  }
})

const chartTheme = useChartTheme()

const chartOptions = computed(() => ({
  responsive:          true,
  maintainAspectRatio: false,
  animation:           false,
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
