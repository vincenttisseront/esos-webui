<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs text-gray-700 dark:text-gray-300">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase tracking-wide text-[10px]">
          <th class="text-left py-1.5 pr-3">ID / SCSI</th>
          <th class="text-left py-1.5 pr-3">RAID</th>
          <th class="text-left py-1.5 pr-3">État</th>
          <th class="text-left py-1.5 pr-3">Taille</th>
          <th class="text-left py-1.5 pr-3">Cache</th>
          <th class="text-left py-1.5 pr-3">Device</th>
          <th v-if="supportsDelete && !readOnly" class="text-right py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="drive in drives"
          :key="drive.id"
          class="border-b border-gray-100 dark:border-gray-800"
        >
          <td class="py-1.5 pr-3 font-mono text-gray-600 dark:text-gray-400">
            {{ drive.scsiAddress ?? drive.id }}
            <span v-if="drive.scsiModel" class="block text-[10px] text-gray-400 dark:text-gray-600">{{ drive.scsiModel }}</span>
          </td>
          <td class="py-1.5 pr-3">
            <span v-if="drive.raidLevel === 'unknown'" class="text-gray-400 italic">—</span>
            <span v-else>RAID{{ drive.raidLevel }}</span>
          </td>
          <td class="py-1.5 pr-3">
            <UBadge :color="ldStateColor(drive.state)" :label="drive.state" size="xs" variant="soft" />
          </td>
          <td class="py-1.5 pr-3 tabular-nums">{{ drive.sizeBytes ? formatSize(drive.sizeBytes) : '—' }}</td>
          <td class="py-1.5 pr-3 text-gray-500">{{ drive.cachePolicy ?? '—' }}</td>
          <td class="py-1.5 pr-3 font-mono text-gray-500 text-[10px]">{{ drive.devicePath ?? '—' }}</td>
          <td v-if="supportsDelete && !readOnly" class="py-1.5 text-right">
            <UButton
              size="xs"
              color="red"
              variant="ghost"
              icon="i-heroicons-trash"
              @click="$emit('delete-ld', drive)"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="readOnly" class="mt-2 text-xs text-amber-600 dark:text-amber-400 italic">
      Niveau RAID et état détaillé indisponibles sans perccli/storcli.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { HardwareRaidLogicalDrive } from '~/types/raid'

defineProps<{
  drives: HardwareRaidLogicalDrive[]
  supportsDelete?: boolean
  readOnly?: boolean
}>()
defineEmits<{ 'delete-ld': [drive: HardwareRaidLogicalDrive] }>()

function ldStateColor(state: string) {
  if (state === 'optimal') return 'green'
  if (state === 'degraded') return 'red'
  if (state === 'rebuilding') return 'amber'
  if (state === 'failed') return 'red'
  return 'gray'
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}
</script>
