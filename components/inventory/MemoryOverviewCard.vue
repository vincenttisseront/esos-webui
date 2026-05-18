<template>
  <div>
    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Mémoire</h3>

    <!-- Overview bar -->
    <div class="mb-4">
      <div class="flex justify-between text-xs text-gray-500 mb-1">
        <span>Utilisée : {{ formatBytes(mem.usedKb * 1024) }}</span>
        <span>Total : {{ formatBytes(mem.totalKb * 1024) }}</span>
      </div>
      <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all"
          :class="mem.usedPct >= 90 ? 'bg-red-400' : mem.usedPct >= 75 ? 'bg-amber-400' : 'bg-blue-400'"
          :style="{ width: `${mem.usedPct}%` }"
        />
      </div>
      <p class="text-right text-[10px] text-gray-400 mt-0.5">{{ mem.usedPct }}% utilisé</p>
    </div>

    <!-- Swap -->
    <div v-if="mem.swapTotalKb > 0" class="text-xs text-gray-500 mb-4">
      Swap : {{ formatBytes(mem.swapUsedKb * 1024) }} / {{ formatBytes(mem.swapTotalKb * 1024) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MemoryOverview } from '~/server/utils/types'

defineProps<{ mem: MemoryOverview }>()

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(0)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}
</script>
