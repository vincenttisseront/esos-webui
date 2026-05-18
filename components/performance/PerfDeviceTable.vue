<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 font-medium">
        <tr>
          <th class="text-left px-4 py-2.5">Device</th>
          <th class="text-left px-4 py-2.5">Statut</th>
          <th class="text-right px-4 py-2.5">Lecture</th>
          <th class="text-right px-4 py-2.5">Écriture</th>
          <th class="text-right px-4 py-2.5">Total</th>
          <th class="text-right px-4 py-2.5">Lat. lect.</th>
          <th class="text-right px-4 py-2.5">Lat. écrit.</th>
          <th class="text-left px-4 py-2.5">Dernier sample</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
        <tr
          v-for="d in devices"
          :key="d.device"
          class="cursor-pointer transition-colors"
          :class="selectedDevice === d.device
            ? 'bg-primary-50 dark:bg-primary-900/20'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'"
          @click="$emit('select', d.device)"
        >
          <td class="px-4 py-3 font-mono font-semibold text-gray-800 dark:text-gray-100">{{ d.device }}</td>
          <td class="px-4 py-3">
            <UBadge
              :color="statusColor(d.status)"
              :label="statusLabel(d.status)"
              size="xs"
            />
          </td>
          <td class="px-4 py-3 text-right font-mono text-blue-600">{{ fmt(d.readKbps) }}</td>
          <td class="px-4 py-3 text-right font-mono text-orange-500">{{ fmt(d.writeKbps) }}</td>
          <td class="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{{ fmt(d.deviceRateKbps) }}</td>
          <td class="px-4 py-3 text-right font-mono" :class="latencyClass(d.averageReadTimeMs)">
            {{ d.averageReadTimeMs.toFixed(1) }} ms
          </td>
          <td class="px-4 py-3 text-right font-mono" :class="latencyClass(d.averageWriteTimeMs)">
            {{ d.averageWriteTimeMs.toFixed(1) }} ms
          </td>
          <td class="px-4 py-3 text-xs text-gray-500">
            {{ d.lastSampleAt ? new Date(d.lastSampleAt).toLocaleTimeString() : '—' }}
          </td>
        </tr>
        <tr v-if="devices.length === 0">
          <td colspan="8" class="px-4 py-8 text-center text-sm text-gray-400">
            Aucun device disponible
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { PerfDeviceSummary } from '~/server/utils/perf-agent-types'

defineProps<{
  devices: PerfDeviceSummary[]
  selectedDevice?: string
}>()
defineEmits<{ select: [device: string] }>()

function fmt(kbps: number): string {
  if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(2)} GB/s`
  if (kbps >= 1_000) return `${(kbps / 1_000).toFixed(1)} MB/s`
  return `${Math.round(kbps)} KB/s`
}

function statusColor(status: PerfDeviceSummary['status']) {
  switch (status) {
    case 'hot': return 'red'
    case 'active': return 'blue'
    case 'idle': return 'gray'
    case 'stale': return 'orange'
    default: return 'gray'
  }
}

function statusLabel(status: PerfDeviceSummary['status']) {
  switch (status) {
    case 'hot': return 'Chaud'
    case 'active': return 'Actif'
    case 'idle': return 'Inactif'
    case 'stale': return 'Obsolète'
    default: return 'Inconnu'
  }
}

function latencyClass(ms: number) {
  if (ms > 50) return 'text-red-600 dark:text-red-400'
  if (ms > 10) return 'text-orange-500'
  return 'text-gray-600 dark:text-gray-400'
}
</script>
