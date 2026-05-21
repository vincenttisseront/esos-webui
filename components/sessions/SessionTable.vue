<template>
  <div
    v-if="sessions.length > 0"
    class="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-100 dark:border-gray-800"
  >
    <table class="w-full text-sm">
      <thead class="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
        <tr>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.sessions.table.headers.initiator') }}</th>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.sessions.table.headers.ip') }}</th>
          <th v-if="!hideTarget" class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.sessions.table.headers.target') }}</th>
          <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ t('storage.sessions.table.headers.sid') }}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
        <tr
          v-for="s in sessions"
          :key="`${s.target}:${s.sid}:${s.initiatorName}`"
          class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          <td class="px-4 py-3">
            <IqnDisplay :iqn="s.initiatorName" />
          </td>
          <td class="px-4 py-3 font-mono text-sm text-gray-600 dark:text-gray-300">
            <template v-if="s.driver === 'qla2x00t' && !s.ipAddr">
              <span class="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                <UIcon name="i-heroicons-signal" class="w-3 h-3" />
                {{ t('storage.sessions.table.fcBadge') }}
              </span>
            </template>
            <template v-else>
              {{ s.ipAddr || '—' }}
            </template>
          </td>
          <td v-if="!hideTarget" class="px-4 py-3">
            <NuxtLink
              v-if="s.target"
              :to="`/targets/${encodeURIComponent(s.target)}`"
              class="text-primary-500 hover:underline"
            >
              <IqnDisplay :iqn="s.target" short />
            </NuxtLink>
            <span v-else class="text-gray-400">—</span>
          </td>
          <td class="px-4 py-3 font-mono text-xs text-gray-400">
            <template v-if="s.driver === 'qla2x00t' && !s.sid">—</template>
            <template v-else>{{ s.sid || '—' }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <EmptyState
    v-else-if="!loading"
    :message="t('storage.sessions.table.emptyTitle')"
    :sub-message="t('storage.sessions.table.emptySub')"
    icon="🔌"
  />
</template>

<script setup lang="ts">
import type { Session } from '~/types/esos'

const { t } = useEsosI18n()

defineProps<{
  sessions: Session[]
  loading?: boolean
  hideTarget?: boolean
}>()
</script>
