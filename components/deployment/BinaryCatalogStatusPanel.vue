<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <span class="font-semibold">{{ t('admin.deployment.status.title') }}</span>
        <UButton
          size="xs"
          color="gray"
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="loading"
          @click="load"
        />
      </div>
    </template>
    <p v-if="loading && !status" class="text-sm text-gray-400">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>
    <dl v-else-if="status" class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <div>
        <dt class="text-gray-500">{{ t('admin.deployment.status.path') }}</dt>
        <dd class="font-mono text-xs break-all">{{ status.path }}</dd>
      </div>
      <div>
        <dt class="text-gray-500">{{ t('admin.deployment.status.exists') }}</dt>
        <dd>
          <UBadge :color="status.exists ? 'green' : 'amber'" size="xs">
            {{ status.exists ? t('admin.deployment.container.yes') : t('admin.deployment.container.no') }}
          </UBadge>
        </dd>
      </div>
      <div>
        <dt class="text-gray-500">{{ t('admin.deployment.status.writable') }}</dt>
        <dd>
          <UBadge :color="status.writable ? 'green' : 'red'" size="xs">
            {{ status.writable ? t('admin.deployment.container.yes') : t('admin.deployment.container.no') }}
          </UBadge>
        </dd>
      </div>
      <div>
        <dt class="text-gray-500">{{ t('admin.deployment.status.file_count') }}</dt>
        <dd>{{ status.fileCount }}</dd>
      </div>
      <div>
        <dt class="text-gray-500">{{ t('admin.deployment.status.runtime_user') }}</dt>
        <dd class="font-mono text-xs">
          {{ status.runtimeUser }}
          <span v-if="status.runtimeUid != null" class="text-gray-400">
            (uid {{ status.runtimeUid }}<span v-if="status.runtimeGid != null"> / gid {{ status.runtimeGid }}</span>)
          </span>
        </dd>
      </div>
      <div class="sm:col-span-2">
        <dt class="text-gray-500">{{ t('admin.deployment.status.max_size') }}</dt>
        <dd>{{ formatDeploymentBytes(status.maxBytes) }}</dd>
      </div>
      <div v-if="!status.writable && status.suggestedFix" class="sm:col-span-2">
        <UAlert
          color="amber"
          variant="subtle"
          :title="t('admin.deployment.status.suggested_fix_title') as string"
          :description="status.suggestedFix"
        />
      </div>
      <div v-if="status.errorMessage" class="sm:col-span-2">
        <UAlert color="red" variant="subtle" :title="status.errorMessage" />
      </div>
    </dl>
  </UCard>
</template>

<script setup lang="ts">
import type { BinariesStorageStatusDto } from '~/types/deployment'
import { formatDeploymentBytes } from '~/utils/deployment-ui'

const { t, tError } = useEsosI18n()

const loading = ref(false)
const status = ref<BinariesStorageStatusDto | null>(null)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ status: BinariesStorageStatusDto }>('/api/admin/binaries/status')
    status.value = res.status
  } catch (err: unknown) {
    error.value = tError(err as Parameters<typeof tError>[0])
  } finally {
    loading.value = false
  }
}

onMounted(() => { void load() })

defineExpose({ reload: load })
</script>
