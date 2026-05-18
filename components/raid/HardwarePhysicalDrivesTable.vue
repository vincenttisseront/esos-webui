<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs text-gray-700 dark:text-gray-300">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase tracking-wide text-[10px]">
          <th class="text-left py-1.5 pr-3">Slot</th>
          <th class="text-left py-1.5 pr-3">État</th>
          <th class="text-left py-1.5 pr-3">Taille</th>
          <th class="text-left py-1.5 pr-3">Type</th>
          <th class="text-left py-1.5 pr-3">Modèle</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="drive in drives"
          :key="`${drive.enclosure}-${drive.slot}`"
          class="border-b border-gray-100 dark:border-gray-800"
        >
          <td class="py-1.5 pr-3 font-mono">
            {{ drive.enclosure ? `${drive.enclosure}:${drive.slot}` : drive.slot }}
          </td>
          <td class="py-1.5 pr-3">
            <UBadge :color="pdStateColor(drive.state)" :label="drive.state" size="xs" variant="soft" />
          </td>
          <td class="py-1.5 pr-3 tabular-nums">{{ formatSize(drive.sizeBytes) }}</td>
          <td class="py-1.5 pr-3">{{ drive.mediaType ?? '—' }}</td>
          <td class="py-1.5 pr-3 text-gray-600 dark:text-gray-400 truncate max-w-[180px]">{{ drive.model ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { HardwareRaidPhysicalDrive } from '~/types/raid'

defineProps<{ drives: HardwareRaidPhysicalDrive[] }>()

function pdStateColor(state: string) {
  if (state === 'online') return 'green'
  if (state === 'hotspare') return 'blue'
  if (state === 'failed') return 'red'
  if (state === 'rebuild') return 'amber'
  if (state === 'unconfigured_good') return 'gray'
  return 'gray'
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(1)} MB`
  return `${bytes} B`
}
</script>
