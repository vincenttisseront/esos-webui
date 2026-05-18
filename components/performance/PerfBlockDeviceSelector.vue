<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Block Devices</h3>
      <UButton
        size="xs"
        :loading="loading"
        icon="i-heroicons-arrow-path"
        variant="ghost"
        color="gray"
        @click="$emit('refresh')"
      />
    </div>

    <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 font-medium">
          <tr>
            <th class="px-3 py-2 text-center w-10">✓</th>
            <th class="px-3 py-2 text-left">Device</th>
            <th class="px-3 py-2 text-left">Type</th>
            <th class="px-3 py-2 text-right">Taille</th>
            <th class="px-3 py-2 text-left hidden sm:table-cell">Modèle</th>
            <th class="px-3 py-2 text-left hidden md:table-cell">Avertissement</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
          <tr
            v-for="d in devices"
            :key="d.name"
            class="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
            @click="toggle(d.name)"
          >
            <td class="px-3 py-2 text-center">
              <input
                type="checkbox"
                :checked="selected.has(d.name)"
                class="rounded border-gray-300 text-primary-600 cursor-pointer"
                @click.stop="toggle(d.name)"
              />
            </td>
            <td class="px-3 py-2 font-mono font-semibold text-gray-800 dark:text-gray-100">/dev/{{ d.name }}</td>
            <td class="px-3 py-2">
              <UBadge :label="d.type" size="xs" :color="typeColor(d.type)" />
            </td>
            <td class="px-3 py-2 text-right text-gray-600 dark:text-gray-400 text-xs font-mono">
              {{ fmtSize(d.size) }}
            </td>
            <td class="px-3 py-2 text-xs text-gray-500 hidden sm:table-cell">
              {{ d.model || d.vendor || '—' }}
            </td>
            <td class="px-3 py-2 hidden md:table-cell">
              <span v-if="d.warning" class="text-xs text-orange-500 flex items-center gap-1">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5" />
                {{ d.warning }}
              </span>
            </td>
          </tr>
          <tr v-if="devices.length === 0">
            <td colspan="6" class="px-4 py-6 text-center text-sm text-gray-400">Aucun device détecté</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="text-xs text-gray-400">
      {{ selected.size }} device(s) sélectionné(s)
    </p>
  </div>
</template>

<script setup lang="ts">
import type { BlockDeviceInfo } from '~/server/utils/perf-agent-types'

const props = defineProps<{
  devices: BlockDeviceInfo[]
  modelValue: string[]
  loading?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  refresh: []
}>()

const selected = computed(() => new Set(props.modelValue))

function toggle(name: string) {
  const next = new Set(selected.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  emit('update:modelValue', [...next])
}

function fmtSize(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

function typeColor(type: string) {
  if (type === 'NVMe') return 'violet'
  if (type === 'SSD') return 'blue'
  if (type === 'USB') return 'orange'
  return 'gray'
}
</script>
