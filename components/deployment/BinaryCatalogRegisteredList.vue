<template>
  <UCard>
    <template #header>
      <span class="font-semibold">{{ t('admin.deployment.catalog.title') }}</span>
    </template>
    <p v-if="!binaries.length" class="text-sm text-gray-500">
      {{ t('admin.deployment.catalog.empty') }}
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <th class="py-2 pr-4">{{ t('admin.deployment.catalog.name') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.catalog.version') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.container.size') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.catalog.sha256') }}</th>
            <th class="py-2">{{ t('admin.deployment.catalog.imported') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="b in binaries"
            :key="b.id"
            class="border-b border-gray-100 dark:border-gray-800"
          >
            <td class="py-2 pr-4">{{ b.name }}</td>
            <td class="py-2 pr-4">{{ b.version ?? '—' }}</td>
            <td class="py-2 pr-4">{{ formatDeploymentBytes(b.sizeBytes) }}</td>
            <td class="py-2 pr-4 font-mono text-xs">{{ b.sha256.slice(0, 16) }}…</td>
            <td class="py-2 text-xs text-gray-500">{{ b.createdAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { DeploymentBinaryDto } from '~/types/deployment'
import { formatDeploymentBytes } from '~/utils/deployment-ui'

defineProps<{
  binaries: DeploymentBinaryDto[]
}>()

const { t } = useEsosI18n()
</script>
