<script setup lang="ts">
import type { AuthProviderTabId } from '~/utils/auth-providers-admin-ui'

const props = defineProps<{
  modelValue: AuthProviderTabId
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [AuthProviderTabId]
}>()

const { t } = useEsosI18n()

const tabs: { id: AuthProviderTabId; labelKey: string }[] = [
  { id: 'local', labelKey: 'admin.authProviders.page.tabs.local' },
  { id: 'ldap', labelKey: 'admin.authProviders.page.tabs.ldap' },
  { id: 'oidc', labelKey: 'admin.authProviders.page.tabs.oidc' },
  { id: 'roles', labelKey: 'admin.authProviders.page.tabs.roles' },
  { id: 'security', labelKey: 'admin.authProviders.page.tabs.security' },
]

function select(id: AuthProviderTabId) {
  emit('update:modelValue', id)
}
</script>

<template>
  <div
    class="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3"
    role="tablist"
    :aria-label="t('admin.authProviders.page.tabsAria')"
  >
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      class="rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      :class="modelValue === tab.id
        ? 'bg-primary-600 text-white shadow-sm'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
      :aria-selected="modelValue === tab.id"
      @click="select(tab.id)"
    >
      {{ t(tab.labelKey) }}
    </button>
  </div>
</template>
