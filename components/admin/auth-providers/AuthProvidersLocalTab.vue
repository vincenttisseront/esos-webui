<script setup lang="ts">
import type { AdminAuthProvidersDto } from '~/server/utils/auth-providers-config'

defineProps<{
  data: AdminAuthProvidersDto
}>()

const { t } = useEsosI18n()
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/50 p-5 space-y-3">
      <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {{ t('admin.authProviders.local.statusTitle') }}
      </p>
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.local.statusLabel') }}</dt>
          <dd class="font-medium text-green-700 dark:text-green-400">{{ t('admin.authProviders.summary.enabled') }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.summary.userCountLabel') }}</dt>
          <dd class="font-medium text-gray-900 dark:text-gray-100">
            {{ t('admin.authProviders.summary.userCount', { count: data.summary.counts.local }) }}
          </dd>
        </div>
      </dl>
    </div>

    <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
      {{ t('admin.authProviders.local.body') }}
    </p>

    <UButton
      to="/admin/users"
      color="primary"
      variant="soft"
      icon="i-heroicons-users"
      :label="t('admin.authProviders.local.manageUsers')"
    />
  </div>
</template>
