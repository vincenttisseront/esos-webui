<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ t('admin.upgrade.scope_label') }}:
        <span class="font-medium text-gray-900 dark:text-gray-100">{{ scopeLabel }}</span>
      </p>
      <div class="flex items-center gap-2">
        <a
          href="https://github.com/quantum/esos/wiki/13_Upgrading"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          {{ t('admin.upgrade.wiki_link') }}
        </a>
        <UButton
          size="sm"
          icon="i-heroicons-arrow-path"
          :loading="upgradeStore.readinessLoading"
          :disabled="upgradeStore.readinessThrottled"
          @click="emit('refresh', true)"
        >
          {{ t('admin.upgrade.refresh') }}
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="upgradeStore.readinessError"
      color="red"
      variant="soft"
      :title="upgradeStore.readinessError"
    />

    <div v-if="upgradeStore.readinessLoading && !upgradeStore.readiness" class="py-12 text-center text-gray-400">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin mx-auto mb-2" />
    </div>

    <template v-else-if="upgradeStore.readiness">
      <UpgradeVersionCompareCard :availability="upgradeStore.readiness.versionAvailability" />

      <UAlert
        :color="overallColor"
        variant="soft"
        :title="t(`admin.upgrade.levels.${upgradeStore.readiness.overall}`)"
      >
        <ul class="mt-2 text-sm space-y-1 list-disc list-inside">
          <li v-for="code in upgradeStore.readiness.summary" :key="code">
            {{ t(code) }}
          </li>
        </ul>
      </UAlert>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UpgradeNodeCard
          v-for="node in upgradeStore.readiness.nodes"
          :key="node.sanId"
          :node="node"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{ (e: 'refresh', force?: boolean): void }>()

const props = defineProps<{ scopeLabel: string }>()

const { t } = useEsosI18n()
const upgradeStore = useUpgradeStore()

const overallColor = computed(() => {
  const o = upgradeStore.readiness?.overall
  if (o === 'ready') return 'green'
  if (o === 'warning') return 'amber'
  return 'red'
})
</script>
