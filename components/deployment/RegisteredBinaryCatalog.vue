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
            <th class="py-2 pr-4">{{ t('admin.deployment.catalog.filename') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.catalog.version') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.container.size') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.catalog.status') }}</th>
            <th class="py-2">{{ t('admin.deployment.catalog.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="b in binaries"
            :key="b.id"
            class="border-b border-gray-100 dark:border-gray-800"
          >
            <td class="py-2 pr-4">{{ b.name }}</td>
            <td class="py-2 pr-4 font-mono text-xs">{{ b.filename }}</td>
            <td class="py-2 pr-4">{{ b.version ?? '—' }}</td>
            <td class="py-2 pr-4">{{ formatDeploymentBytes(b.sizeBytes) }}</td>
            <td class="py-2 pr-4">
              <UBadge :color="statusColor(b.status)" size="xs">{{ statusLabel(b.status) }}</UBadge>
            </td>
            <td class="py-2">
              <div class="flex flex-wrap gap-1">
                <UButton
                  size="xs"
                  color="gray"
                  variant="outline"
                  :loading="deletingId === `${b.id}:catalog`"
                  @click="emit('delete-catalog', b)"
                >
                  {{ t('admin.deployment.catalog.delete_catalog') }}
                </UButton>
                <UButton
                  size="xs"
                  color="amber"
                  variant="outline"
                  :loading="deletingId === `${b.id}:file`"
                  @click="emit('delete-file', b)"
                >
                  {{ t('admin.deployment.catalog.delete_file') }}
                </UButton>
                <UButton
                  size="xs"
                  color="red"
                  variant="soft"
                  :loading="deletingId === `${b.id}:full`"
                  @click="emit('delete-full', b)"
                >
                  {{ t('admin.deployment.catalog.delete_full') }}
                </UButton>
              </div>
              <p class="text-xs text-gray-400 mt-1 font-mono truncate max-w-xs" :title="b.storedPath">
                {{ b.storedPath }}
              </p>
            </td>
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
  deletingId?: string | null
}>()

const emit = defineEmits<{
  'delete-catalog': [binary: DeploymentBinaryDto]
  'delete-file': [binary: DeploymentBinaryDto]
  'delete-full': [binary: DeploymentBinaryDto]
}>()

const { t } = useEsosI18n()

function statusColor(status: string): 'green' | 'amber' | 'gray' | 'red' {
  if (status === 'available' || status === 'registered') return 'green'
  if (status === 'missing') return 'amber'
  if (status === 'disabled') return 'gray'
  return 'gray'
}

function statusLabel(status: string): string {
  const key = `admin.deployment.catalog.status_${status}` as const
  const v = t(key)
  return v !== key ? (v as string) : status
}
</script>
