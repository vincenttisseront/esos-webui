<template>
  <UAlert
    color="neutral"
    variant="subtle"
    icon="i-heroicons-information-circle"
    class="mb-4"
    :title="title"
  >
    <template #description>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ description }}
      </p>
      <p
        v-if="editsDisabled"
        class="text-xs text-amber-700 dark:text-amber-300 mt-2 font-medium"
      >
        {{ t('admin.sysconfig.page.tab_scope.edits_disabled') }}
      </p>
    </template>
  </UAlert>
</template>

<script setup lang="ts">
import type { SysconfigTabScopeKind } from '~/composables/useSysconfigClusterScope'

const props = defineProps<{
  scopeKind: SysconfigTabScopeKind
  nodeLabel: string
  editsDisabled?: boolean
}>()

const { t } = useEsosI18n()

const badgeKey = computed(() => {
  switch (props.scopeKind) {
    case 'perNode':
      return 'admin.sysconfig.page.tab_scope.badge_per_node'
    case 'clusterFuture':
      return 'admin.sysconfig.page.tab_scope.badge_cluster_future'
    case 'clusterAssistant':
      return 'admin.sysconfig.page.tab_scope.badge_cluster_assistant'
  }
})

const title = computed(() => t(badgeKey.value) as string)

const description = computed(() => {
  switch (props.scopeKind) {
    case 'perNode':
      return t('admin.sysconfig.page.tab_scope.per_node_body') as string
    case 'clusterFuture':
      return t('admin.sysconfig.page.tab_scope.cluster_future_body', { label: props.nodeLabel }) as string
    case 'clusterAssistant':
      return t('admin.sysconfig.page.tab_scope.cluster_assistant_body', { label: props.nodeLabel }) as string
  }
})
</script>
