<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-100 dark:border-gray-800"
  >
    <table class="w-full text-sm">
      <thead class="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
        <tr>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.targets.table.headers.iqn') }}</th>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.targets.table.headers.driver') }}</th>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.targets.table.headers.state') }}</th>
          <th class="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">{{ t('storage.targets.table.headers.groups') }}</th>
          <th class="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400">{{ t('storage.targets.table.headers.sessions') }}</th>
          <th class="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
        <tr
          v-for="target in targets"
          :key="target.name"
          class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <td class="px-4 py-3">
            <NuxtLink
              :to="`/targets/${encodeURIComponent(target.name)}`"
              class="text-primary-600 dark:text-primary-400 hover:underline"
            >
              <IqnDisplay :iqn="target.name" />
            </NuxtLink>
          </td>
          <td class="px-4 py-3">
            <UBadge color="blue" variant="soft" :label="target.driver" />
          </td>
          <td class="px-4 py-3">
            <TargetBadge :enabled="target.enabled" />
          </td>
          <td class="px-4 py-3 text-center text-gray-600 dark:text-gray-300">
            {{ target.groups.length }}
          </td>
          <td class="px-4 py-3 text-center">
            <span
              :class="target.sessions.length > 0
                ? 'text-green-600 dark:text-green-400 font-semibold'
                : 'text-gray-400'"
            >
              {{ target.sessions.length }}
            </span>
          </td>
          <td class="px-4 py-3 text-right">
            <NuxtLink
              :to="`/targets/${encodeURIComponent(target.name)}`"
              class="text-primary-500 hover:underline text-sm"
            >
              {{ t('storage.targets.table.detail') }}
            </NuxtLink>
          </td>
        </tr>
        <tr v-if="!loading && targets.length === 0">
          <td colspan="6">
            <EmptyState :message="t('storage.targets.table.empty')" icon="🎯" />
          </td>
        </tr>
        <tr v-if="loading && targets.length === 0">
          <td colspan="6" class="px-4 py-6 text-center text-sm text-gray-400">
            {{ t('storage.targets.table.loading') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { Target } from '~/types/esos'

const { t } = useEsosI18n()

defineProps<{
  targets: Target[]
  loading?: boolean
  compact?: boolean
}>()
</script>
