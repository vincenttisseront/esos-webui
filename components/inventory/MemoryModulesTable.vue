<template>
  <div v-if="modules.length">
    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Barrettes mémoire</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div
        v-for="(m, i) in modules"
        :key="i"
        class="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs space-y-0.5"
      >
        <p class="font-semibold text-gray-700">{{ m.locator }}</p>
        <p class="text-gray-500">{{ formatBytes(m.size * 1024 * 1024) }} · {{ m.type }} {{ m.speed ? `@ ${m.speed} MT/s` : '' }}</p>
        <p v-if="m.manufacturer" class="text-gray-400">{{ m.manufacturer }}</p>
        <p v-if="m.partNumber" class="font-mono text-gray-400">{{ m.partNumber }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MemoryModule } from '~/server/utils/types'

defineProps<{ modules: MemoryModule[] }>()

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(0)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}
</script>
