<script setup lang="ts">
import {
  formatLdapAuthEventForCopy,
  type LdapAuthEventRecord,
} from '~/utils/ldap-auth-events-format'

const props = defineProps<{
  readOnly?: boolean
}>()

const { t } = useEsosI18n()
const { success: toastOk } = useAppToast()

const filterType   = ref<'all' | 'test' | 'login' | 'provisioning'>('all')
const filterResult = ref<'all' | 'success' | 'failure'>('all')
const pending      = ref(false)
const events       = ref<LdapAuthEventRecord[]>([])
const retention    = ref<{ maxRows: number; days: number } | null>(null)

async function load() {
  pending.value = true
  try {
    const q: Record<string, string> = { limit: '50' }
    if (filterType.value !== 'all') q.type = filterType.value
    if (filterResult.value !== 'all') q.result = filterResult.value
    const r = await $fetch<{
      events: LdapAuthEventRecord[]
      retention: { maxRows: number; days: number }
    }>('/api/admin/auth-providers/ldap/events', { query: q })
    events.value    = r.events
    retention.value = r.retention
  } catch {
    events.value = []
  } finally {
    pending.value = false
  }
}

onMounted(() => { void load() })

watch([filterType, filterResult], () => { void load() })

function formatTime(at: string): string {
  try {
    return new Date(at).toLocaleString()
  } catch {
    return at
  }
}

function errorSummary(e: LdapAuthEventRecord): string {
  if (e.safeCode) return e.safeCode
  if (e.ldapErrorName) return e.ldapErrorName
  return '—'
}

async function copyEvent(e: LdapAuthEventRecord) {
  if (!import.meta.client) return
  try {
    await navigator.clipboard.writeText(formatLdapAuthEventForCopy(e))
    toastOk(t('admin.authProviders.ldap.eventLog.copyTitle'), t('admin.authProviders.ldap.eventLog.copyBody'))
  } catch { /* ignore */ }
}

async function copyAll() {
  if (!import.meta.client || !events.value.length) return
  const text = events.value.map((e) => formatLdapAuthEventForCopy(e)).join('\n\n---\n\n')
  try {
    await navigator.clipboard.writeText(text)
    toastOk(t('admin.authProviders.ldap.eventLog.copyTitle'), t('admin.authProviders.ldap.eventLog.copyAllBody'))
  } catch { /* ignore */ }
}

function resultColor(result: string): 'green' | 'red' | 'gray' {
  if (result === 'success') return 'green'
  if (result === 'failure') return 'red'
  return 'gray'
}
</script>

<template>
  <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {{ t('admin.authProviders.ldap.eventLog.title') }}
        </h3>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {{ t('admin.authProviders.ldap.eventLog.desc') }}
        </p>
        <p v-if="retention" class="mt-1 text-xs text-gray-500">
          {{
            t('admin.authProviders.ldap.eventLog.retention', {
              days: retention.days,
              max:  retention.maxRows,
            })
          }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2 shrink-0">
        <UButton
          size="sm"
          color="gray"
          variant="soft"
          icon="i-heroicons-arrow-path"
          :loading="pending"
          :label="t('admin.authProviders.ldap.eventLog.refresh')"
          @click="load"
        />
        <UButton
          v-if="events.length"
          size="sm"
          color="gray"
          variant="ghost"
          icon="i-heroicons-clipboard-document"
          :label="t('admin.authProviders.ldap.eventLog.copyAll')"
          @click="copyAll"
        />
      </div>
    </div>

    <div class="flex flex-wrap gap-3">
      <USelect
        v-model="filterType"
        :items="[
          { value: 'all', label: t('admin.authProviders.ldap.eventLog.filterTypeAll') },
          { value: 'test', label: t('admin.authProviders.ldap.eventLog.filterTypeTest') },
          { value: 'login', label: t('admin.authProviders.ldap.eventLog.filterTypeLogin') },
          { value: 'provisioning', label: t('admin.authProviders.ldap.eventLog.filterTypeProvisioning') },
        ]"
        value-key="value"
        class="w-44"
      />
      <USelect
        v-model="filterResult"
        :items="[
          { value: 'all', label: t('admin.authProviders.ldap.eventLog.filterResultAll') },
          { value: 'success', label: t('admin.authProviders.ldap.eventLog.filterResultSuccess') },
          { value: 'failure', label: t('admin.authProviders.ldap.eventLog.filterResultFailure') },
        ]"
        value-key="value"
        class="w-40"
      />
    </div>

    <p v-if="pending" class="text-sm text-gray-500">{{ t('common.loading') }}</p>
    <p v-else-if="!events.length" class="text-sm text-gray-500">
      {{ t('admin.authProviders.ldap.eventLog.empty') }}
    </p>

    <div v-else class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table class="min-w-full text-xs">
        <thead class="bg-gray-50 dark:bg-gray-800/80 text-left uppercase text-gray-500">
          <tr>
            <th class="p-2">{{ t('admin.authProviders.ldap.eventLog.colTime') }}</th>
            <th class="p-2">{{ t('admin.authProviders.ldap.eventLog.colType') }}</th>
            <th class="p-2">{{ t('admin.authProviders.ldap.eventLog.colStep') }}</th>
            <th class="p-2">{{ t('admin.authProviders.ldap.eventLog.colResult') }}</th>
            <th class="p-2">{{ t('admin.authProviders.ldap.eventLog.colUser') }}</th>
            <th class="p-2">{{ t('admin.authProviders.ldap.eventLog.colError') }}</th>
            <th class="p-2" />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
          <tr v-for="e in events" :key="e.id">
            <td class="p-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{{ formatTime(e.at) }}</td>
            <td class="p-2">
              <span class="font-medium">{{ e.eventType }}</span>
              <span class="text-gray-500">/{{ e.action }}</span>
            </td>
            <td class="p-2 font-mono">{{ e.step }}</td>
            <td class="p-2">
              <UBadge :color="resultColor(e.result)" variant="subtle" size="xs">{{ e.result }}</UBadge>
            </td>
            <td class="p-2 font-mono">{{ e.username || '—' }}</td>
            <td class="p-2 font-mono text-red-700 dark:text-red-400 max-w-[12rem] truncate" :title="e.diagnosticMessage ?? ''">
              {{ errorSummary(e) }}
            </td>
            <td class="p-2 text-right">
              <UButton
                size="2xs"
                color="gray"
                variant="ghost"
                icon="i-heroicons-clipboard"
                @click="copyEvent(e)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
