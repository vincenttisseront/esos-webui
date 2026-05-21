<template>
  <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-6 py-5">
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-start gap-5">
        <!-- Server icon -->
        <div class="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-server" class="w-8 h-8 text-gray-500 dark:text-gray-400" />
        </div>

        <div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
            {{ inv.system.manufacturer }} {{ inv.system.productName }}
          </h1>
          <p class="text-sm text-blue-600 font-mono mt-0.5">{{ inv.hostname }}</p>

          <div class="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-xs text-gray-500 dark:text-gray-400">
            <span class="flex items-center gap-1">
              <UIcon name="i-heroicons-tag" class="w-3.5 h-3.5 shrink-0" />
              S/N&nbsp;:&nbsp;<span class="font-mono text-gray-700 dark:text-gray-300">{{ inv.system.serialNumber }}</span>
            </span>
            <span class="flex items-center gap-1">
              <UIcon name="i-heroicons-cpu-chip" class="w-3.5 h-3.5 shrink-0" />
              {{ inv.cpu.logicalCores }} vCPUs · {{ inv.cpu.sockets }} socket(s)
            </span>
            <span class="flex items-center gap-1">
              <UIcon name="i-heroicons-circle-stack" class="w-3.5 h-3.5 shrink-0" />
              {{ formatBytes(inv.memory.totalKb * 1024) }} RAM
            </span>
            <span class="flex items-center gap-1">
              <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5 shrink-0" />
              Uptime&nbsp;: {{ formatUptime(inv.uptime) }}
            </span>
            <span class="flex items-center gap-1">
              <UIcon name="i-heroicons-command-line" class="w-3.5 h-3.5 shrink-0" />
              {{ inv.osVersion }}
            </span>
          </div>
        </div>
      </div>

      <!-- Load avg + refresh -->
      <div class="text-right shrink-0">
        <div class="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Load avg</div>
        <div class="font-mono text-sm font-semibold text-gray-700 dark:text-gray-300">
          {{ inv.loadAvg[0].toFixed(2) }} / {{ inv.loadAvg[1].toFixed(2) }} / {{ inv.loadAvg[2].toFixed(2) }}
        </div>
        <UButton
          size="xs" color="gray" variant="outline"
          icon="i-heroicons-arrow-path"
          class="mt-3"
          :loading="loading"
          label="Actualiser"
          @click="$emit('refresh')"
        />
        <p class="text-[10px] text-gray-300 mt-1">{{ formatAgo(inv.scannedAt) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SystemInventory } from '~/server/utils/types'

defineProps<{ inv: SystemInventory; loading: boolean }>()
defineEmits(['refresh'])

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(0)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}j ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  return s < 60 ? `il y a ${s}s` : `il y a ${Math.floor(s / 60)}min`
}
</script>
