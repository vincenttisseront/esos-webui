<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-100 dark:border-gray-800"
  >
    <table class="w-full text-sm">
      <thead class="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
        <tr>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.devices.table.headers.name') }}</th>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.devices.table.headers.handler') }}</th>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.devices.table.headers.path') }}</th>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.devices.table.headers.usedBy') }}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
        <tr
          v-for="d in devices"
          :key="d.name"
          class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          <td class="px-4 py-3 font-semibold text-gray-800 dark:text-gray-100">
            {{ d.name }}
          </td>
          <td class="px-4 py-3">
            <UBadge :color="handlerColor(d.handler)" variant="soft" :label="d.handler" />
          </td>
          <td class="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
            {{ d.filename }}
          </td>
          <td class="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">
            <UTooltip :text="lunTooltip?.(d.name)" :disabled="!lunTooltip?.(d.name)">
              <slot name="usage" :device="d">
                {{ usage?.(d.name) ?? '—' }}
              </slot>
            </UTooltip>
          </td>
        </tr>
        <tr v-if="!loading && devices.length === 0">
          <td colspan="4">
            <EmptyState :message="t('storage.devices.table.empty')" icon="💾" />
          </td>
        </tr>
        <tr v-if="loading && devices.length === 0">
          <td colspan="4" class="px-4 py-6 text-center text-sm text-gray-400">
            {{ t('storage.devices.table.loading') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { Device } from '~/types/esos'

const { t } = useEsosI18n()

defineProps<{
  devices: Device[]
  loading?: boolean
  usage?: (name: string) => string
  lunTooltip?: (name: string) => string | undefined
}>()

function handlerColor(handler: string) {
  const colors: Record<string, 'blue' | 'purple' | 'gray'> = {
    vdisk_blockio: 'blue',
    vdisk_fileio: 'purple',
    dev_disk: 'gray',
  }
  return colors[handler] ?? 'gray'
}
</script>
