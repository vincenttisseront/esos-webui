<template>
  <UCard>
    <template #header>
      <span class="text-lg font-semibold">{{ t('volumes.card.title') }}</span>
    </template>

    <div v-if="volumes.length === 0" class="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
      {{ t('volumes.card.empty') }}
    </div>

    <div v-else class="space-y-4">
      <div v-for="vol in volumes" :key="vol.mountpoint">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-mono">{{ vol.mountpoint }}</span>
          <span :class="['text-sm font-semibold', colorClass(vol.usedPct)]">
            {{ vol.usedPct }}%
          </span>
        </div>
        <div class="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            :class="['h-2 rounded-full transition-all duration-500', barClass(vol.usedPct)]"
            :style="{ width: `${vol.usedPct}%` }"
          />
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {{ formatKb(vol.usedKb) }} / {{ formatKb(vol.totalKb) }}
          — {{ formatKb(vol.availableKb) }} {{ t('volumes.card.free') }}
        </p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { VolumeUsage } from '~/server/utils/types'

const { t } = useEsosI18n()

defineProps<{ volumes: VolumeUsage[] }>()

function colorClass(pct: number): string {
  if (pct > 90) return 'text-red-500'
  if (pct > 75) return 'text-yellow-500'
  return 'text-teal-600'
}

function barClass(pct: number): string {
  if (pct > 90) return 'bg-red-500'
  if (pct > 75) return 'bg-yellow-400'
  return 'bg-teal-500'
}

function formatKb(kb: number): string {
  if (kb >= 1_073_741_824) return `${(kb / 1_073_741_824).toFixed(1)} TB`
  if (kb >= 1_048_576) return `${(kb / 1_048_576).toFixed(1)} GB`
  if (kb >= 1_024) return `${(kb / 1_024).toFixed(0)} MB`
  return `${kb} KB`
}
</script>
