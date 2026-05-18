<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs text-gray-700 dark:text-gray-300">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase tracking-wide text-[10px]">
          <th class="text-left py-1.5 pr-3">Device</th>
          <th class="text-left py-1.5 pr-3">Type</th>
          <th class="text-left py-1.5 pr-3">Partition</th>
          <th class="text-left py-1.5 pr-3">Taille</th>
          <th class="text-left py-1.5 pr-3">Utilisation</th>
          <th class="text-left py-1.5 pr-3">Montage</th>
          <th class="text-left py-1.5 pr-3">Éligible MD</th>
          <th class="text-left py-1.5 pr-3">Prépa MD</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="dev in devices"
          :key="dev.path"
          class="border-b border-gray-100 dark:border-gray-800"
          :class="{ 'opacity-50': !dev.eligibleForMd && !dev.eligibleForHardwareRaid }"
        >
          <td class="py-1.5 pr-3 font-mono">{{ dev.path }}</td>
          <td class="py-1.5 pr-3 uppercase text-[10px] text-gray-500">{{ dev.type }}</td>
          <td class="py-1.5 pr-3 text-[10px] text-gray-500">
            {{ dev.partitionTypeName ?? dev.partitionTypeCode ?? '—' }}
          </td>
          <td class="py-1.5 pr-3 tabular-nums">{{ formatSize(dev.sizeBytes) }}</td>
          <td class="py-1.5 pr-3">
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="u in dev.usedBy"
                :key="u"
                :color="usedByColor(u)"
                :label="u"
                size="xs"
                variant="soft"
              />
              <span v-if="!dev.usedBy.length" class="text-gray-400">—</span>
            </div>
          </td>
          <td class="py-1.5 pr-3 font-mono text-gray-500 text-[10px]">{{ dev.mountpoint ?? '—' }}</td>
          <td class="py-1.5 pr-3">
            <div class="flex items-center gap-2">
              <UIcon
                :name="dev.eligibleForMd ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="dev.eligibleForMd ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'"
                class="w-4 h-4 shrink-0"
              />
              <span v-if="!dev.eligibleForMd && dev.mdEligibilityReasons?.length" class="text-[10px] text-gray-500">
                {{ dev.mdEligibilityReasons.join(', ') }}
              </span>
            </div>
          </td>
          <td class="py-1.5 pr-3">
            <div class="flex items-center gap-2">
              <UIcon
                :name="dev.eligibleForMdPartitionPrep ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="dev.eligibleForMdPartitionPrep ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'"
                class="w-4 h-4 shrink-0"
              />
              <span v-if="!dev.eligibleForMdPartitionPrep && dev.mdPartitionPrepReasons?.length" class="text-[10px] text-gray-500">
                {{ dev.mdPartitionPrepReasons.join(', ') }}
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { RaidBlockDevice } from '~/types/raid'

defineProps<{ devices: RaidBlockDevice[] }>()

function usedByColor(usage: string) {
  if (usage === 'mounted') return 'red'
  if (usage === 'md') return 'blue'
  if (usage === 'lvm') return 'amber'
  if (usage === 'scst') return 'purple'
  if (usage === 'filesystem') return 'gray'
  return 'gray'
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}
</script>
