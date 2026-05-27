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
            <th class="py-2 pr-4">{{ t('admin.deployment.container.mtime') }}</th>
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
            <td class="py-2 pr-4 text-xs text-gray-500">{{ formatMtime(f.mtimeMs) }}</td>
            <td class="py-2">
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                :loading="importingPath === f.relativePath"
                @click="emit('import', f.relativePath)"
              >
                {{ t('admin.deployment.container.import') }}
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ContainerBinaryEntry } from '~/types/deployment'
import { formatDeploymentBytes } from '~/utils/deployment-ui'

defineProps<{
  files: ContainerBinaryEntry[]
  importingPath?: string | null
}>()

const emit = defineEmits<{ import: [relativePath: string] }>()

const { t } = useEsosI18n()

function formatMtime(ms: number): string {
  return new Date(ms).toLocaleString()
}
</script>
