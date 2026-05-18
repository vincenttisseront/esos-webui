<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
    <div
      v-for="kpi in kpis"
      :key="kpi.label"
      class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3"
    >
      <p class="text-xs text-gray-500 font-medium">{{ kpi.label }}</p>
      <p class="text-lg font-semibold mt-0.5" :class="kpi.color">{{ kpi.value }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PerfDeviceSummary } from '~/server/utils/perf-agent-types'

const props = defineProps<{ devices: PerfDeviceSummary[] }>()

function fmt(kbps: number): string {
  if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(2)} GB/s`
  if (kbps >= 1_000) return `${(kbps / 1_000).toFixed(1)} MB/s`
  return `${Math.round(kbps)} KB/s`
}

function avgMs(devices: PerfDeviceSummary[], key: 'averageReadTimeMs' | 'averageWriteTimeMs'): string {
  if (!devices.length) return '—'
  const avg = devices.reduce((s, d) => s + d[key], 0) / devices.length
  return `${avg.toFixed(1)} ms`
}

function latColor(devices: PerfDeviceSummary[], key: 'averageReadTimeMs' | 'averageWriteTimeMs'): string {
  const avg = devices.length ? devices.reduce((s, d) => s + d[key], 0) / devices.length : 0
  if (avg > 50) return 'text-red-600'
  if (avg > 10) return 'text-orange-500'
  return 'text-gray-800 dark:text-gray-100'
}

const totalRead = computed(() => props.devices.reduce((s, d) => s + d.readKbps, 0))
const totalWrite = computed(() => props.devices.reduce((s, d) => s + d.writeKbps, 0))
const totalRate = computed(() => props.devices.reduce((s, d) => s + d.deviceRateKbps, 0))

const kpis = computed(() => [
  { label: 'Lecture',       value: fmt(totalRead.value),                         color: 'text-blue-600' },
  { label: 'Écriture',      value: fmt(totalWrite.value),                        color: 'text-orange-500' },
  { label: 'Total',         value: fmt(totalRate.value),                         color: 'text-gray-800 dark:text-gray-100' },
  { label: 'Lat. lecture',  value: avgMs(props.devices, 'averageReadTimeMs'),    color: latColor(props.devices, 'averageReadTimeMs') },
  { label: 'Lat. écriture', value: avgMs(props.devices, 'averageWriteTimeMs'),   color: latColor(props.devices, 'averageWriteTimeMs') },
])
</script>
