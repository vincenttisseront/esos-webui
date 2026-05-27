<template>
  <UCard>
    <template #header>
      <span class="font-semibold">{{ t('admin.deployment.container.title') }}</span>
    </template>
    <p v-if="!files.length" class="text-sm text-gray-500">
      {{ t('admin.deployment.container.empty') }}
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <th class="py-2 pr-4">{{ t('admin.deployment.container.path') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.container.size') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.catalog.sha256') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.container.mtime') }}</th>
            <th class="py-2 pr-4">{{ t('admin.deployment.container.registered_col') }}</th>
            <th class="py-2" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="f in files"
            :key="f.relativePath"
            class="border-b border-gray-100 dark:border-gray-800"
          >
            <td class="py-2 pr-4 font-mono text-xs">{{ f.relativePath }}</td>
            <td class="py-2 pr-4">{{ formatDeploymentBytes(f.sizeBytes) }}</td>
            <td class="py-2 pr-4 font-mono text-xs">
              {{ f.sha256 ? `${f.sha256.slice(0, 12)}…` : '—' }}
            </td>
            <td class="py-2 pr-4 text-xs text-gray-500">{{ formatMtime(f.mtimeMs) }}</td>
            <td class="py-2 pr-4">
              <UBadge v-if="f.registered" color="green" size="xs">{{ t('admin.deployment.container.yes') }}</UBadge>
              <UBadge v-else color="gray" size="xs">{{ t('admin.deployment.container.no') }}</UBadge>
            </td>
            <td class="py-2">
              <UButton
                v-if="!f.registered"
                size="xs"
                color="primary"
                variant="soft"
                :loading="registeringPath === f.relativePath"
                @click="emit('register', f.relativePath)"
              >
                {{ t('admin.deployment.container.register_action') }}
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ContainerBinaryListItem } from '~/types/deployment'
import { formatDeploymentBytes } from '~/utils/deployment-ui'

defineProps<{
  files: ContainerBinaryListItem[]
  registeringPath?: string | null
}>()

const emit = defineEmits<{ register: [relativePath: string] }>()

const { t } = useEsosI18n()

function formatMtime(ms: number): string {
  return new Date(ms).toLocaleString()
}
</script>
