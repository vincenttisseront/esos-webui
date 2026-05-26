<template>
  <UCard>
    <template #header>
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {{ t('advanced_storage.block_backends.title') }}
      </h3>
    </template>
    <p v-if="!backends.length" class="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
      {{ t('advanced_storage.block_backends.empty') }}
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <th class="py-2 pr-3">{{ t('advanced_storage.block_backends.path') }}</th>
            <th class="py-2 pr-3">{{ t('advanced_storage.block_backends.kind') }}</th>
            <th class="py-2 pr-3">{{ t('advanced_storage.block_backends.size') }}</th>
            <th class="py-2 pr-3">{{ t('advanced_storage.block_backends.hints') }}</th>
            <th class="py-2">{{ t('advanced_storage.block_backends.source') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in backends"
            :key="row.path"
            class="border-b border-gray-100 dark:border-gray-800 last:border-0"
          >
            <td class="py-2 pr-3 font-mono text-xs">{{ row.path }}</td>
            <td class="py-2 pr-3">{{ row.kind }}</td>
            <td class="py-2 pr-3">{{ formatSize(row.sizeBytes) }}</td>
            <td class="py-2 pr-3">
              <UBadge
                v-for="h in row.usedByHints"
                :key="h"
                size="xs"
                color="gray"
                variant="subtle"
                class="mr-1"
                :label="h"
              />
              <span v-if="!row.usedByHints.length" class="text-gray-400">—</span>
            </td>
            <td class="py-2">
              <UButton
                v-if="sanId"
                size="xs"
                variant="link"
                :to="raidLink(row.path)"
              >
                {{ t('advanced_storage.page.view_raid') }}
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { AdvancedBlockBackend } from '~/types/advanced-storage'

const props = defineProps<{
  backends: AdvancedBlockBackend[]
  sanId?: string
}>()

const { t } = useEsosI18n()

function formatSize(bytes?: number): string {
  if (!bytes) return '—'
  const gb = bytes / (1024 ** 3)
  if (gb >= 1) return `${gb.toFixed(2)} GiB`
  const mb = bytes / (1024 ** 2)
  return `${mb.toFixed(0)} MiB`
}

function raidLink(path: string) {
  const base = `/admin/sans/${props.sanId}/raid`
  return { path: base, query: { highlight: path } }
}
</script>
