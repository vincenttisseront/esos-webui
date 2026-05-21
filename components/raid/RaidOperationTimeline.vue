<template>
  <div class="space-y-2">
    <div
      v-for="(step, i) in steps"
      :key="step.id"
      class="flex gap-3"
    >
      <!-- Indicateur vertical -->
      <div class="flex flex-col items-center">
        <div
          class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs"
          :class="stepCircleClass(step.status)"
        >
          <UIcon v-if="step.status === 'success'" name="i-heroicons-check" class="w-3 h-3" />
          <UIcon v-else-if="step.status === 'failed'" name="i-heroicons-x-mark" class="w-3 h-3" />
          <UIcon v-else-if="step.status === 'running'" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
          <UIcon v-else-if="step.status === 'cancelled'" name="i-heroicons-stop" class="w-3 h-3" />
          <span v-else>{{ i + 1 }}</span>
        </div>
        <div v-if="i < steps.length - 1" class="w-px flex-1 bg-gray-700 mt-1" />
      </div>

      <!-- Contenu -->
      <div class="pb-3 flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-0.5">
          <span class="text-sm text-gray-700 dark:text-gray-200">{{ step.label }}</span>
          <UBadge :color="statusColor(step.status)" :label="step.status" size="xs" variant="soft" />
        </div>
        <code v-if="step.command" class="block text-[10px] text-gray-500 dark:text-gray-400 font-mono bg-gray-900 rounded px-2 py-0.5 truncate mb-1">
          {{ step.command }}
        </code>
        <pre v-if="step.stdoutPreview" class="text-[10px] text-gray-400 whitespace-pre-wrap max-h-20 overflow-y-auto bg-gray-900 rounded px-2 py-1">{{ step.stdoutPreview }}</pre>
        <pre v-if="step.stderrPreview" class="text-[10px] text-red-400 whitespace-pre-wrap max-h-16 overflow-y-auto bg-gray-900 rounded px-2 py-1 mt-1">{{ step.stderrPreview }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RaidOperationStep, RaidOperationStatus } from '~/types/raid'

defineProps<{ steps: RaidOperationStep[] }>()

function statusColor(s: RaidOperationStatus) {
  if (s === 'success') return 'green'
  if (s === 'failed') return 'red'
  if (s === 'running') return 'amber'
  if (s === 'warning') return 'amber'
  if (s === 'cancelled') return 'gray'
  return 'gray'
}

function stepCircleClass(s: RaidOperationStatus) {
  if (s === 'success') return 'bg-green-500/20 text-green-400 ring-1 ring-green-500/30'
  if (s === 'failed') return 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
  if (s === 'running') return 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
  if (s === 'cancelled') return 'bg-gray-600/30 text-gray-500'
  return 'bg-gray-700 text-gray-400'
}
</script>
