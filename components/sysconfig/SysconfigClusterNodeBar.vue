<template>
  <div class="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 px-4 py-4 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-semibold text-blue-900 dark:text-blue-100">
        {{ t('admin.sysconfig.page.cluster_node_bar_title', { name: clusterName }) }}
      </p>
    </div>

    <p class="text-sm text-blue-800 dark:text-blue-200">
      {{ selectedLine }}
    </p>

    <!-- Pills (2 nodes or fewer) -->
    <div v-if="nodes.length <= 2" class="flex flex-wrap gap-2">
      <button
        v-for="node in nodes"
        :key="node.id"
        type="button"
        class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
        :class="node.id === selectedSanId
          ? 'bg-white dark:bg-gray-900 border-primary-400 text-primary-700 dark:text-primary-300 shadow-sm'
          : 'bg-blue-100/60 dark:bg-blue-900/40 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200 hover:bg-white dark:hover:bg-gray-900'"
        @click="emit('select', node.id)"
      >
        <span
          class="w-2 h-2 rounded-full shrink-0"
          :class="sshDotClass(node.sshStatus)"
          :title="sshLabel(node.sshStatus)"
        />
        <span>{{ node.label }}</span>
        <UBadge v-if="node.clusterRole" color="indigo" variant="subtle" size="xs">
          {{ roleLabel(node.clusterRole) }}
        </UBadge>
        <span class="text-xs font-mono text-blue-600/80 dark:text-blue-300/80">{{ node.host }}</span>
        <UIcon
          v-if="node.readOnly"
          name="i-heroicons-lock-closed"
          class="w-3.5 h-3.5 text-amber-600"
        />
      </button>
    </div>

    <!-- Dropdown (3+ nodes) -->
    <div v-else class="max-w-md">
      <USelect
        :model-value="selectedSanId"
        :items="dropdownItems"
        value-key="value"
        label-key="label"
        class="w-full"
        @update:model-value="onDropdownSelect"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SysconfigClusterNodeView } from '~/composables/useSysconfigClusterScope'

const props = defineProps<{
  clusterName: string
  nodes: SysconfigClusterNodeView[]
  selectedSanId: string
  roleLabel: (role: string | null) => string
}>()

const emit = defineEmits<{
  (e: 'select', sanId: string): void
}>()

const { t } = useEsosI18n()

const selectedNode = computed(() =>
  props.nodes.find(n => n.id === props.selectedSanId),
)

const selectedLine = computed(() => {
  const n = selectedNode.value
  if (!n) return '—'
  const role = n.clusterRole ? props.roleLabel(n.clusterRole) : ''
  const rolePart = role ? ` (${role})` : ''
  return t('admin.sysconfig.page.cluster_node_selected', {
    label: n.label,
    role: rolePart,
    host: n.host,
  }) as string
})

const dropdownItems = computed(() =>
  props.nodes.map(n => ({
    value: n.id,
    label: `${n.label} — ${n.host}${n.clusterRole ? ` (${props.roleLabel(n.clusterRole)})` : ''}`,
  })),
)

function onDropdownSelect(id: string | null) {
  if (id && id !== props.selectedSanId) emit('select', id)
}

function sshDotClass(status: string | undefined): string {
  switch (status) {
    case 'connected':
      return 'bg-green-500'
    case 'connecting':
    case 'reconnecting':
      return 'bg-yellow-500 animate-pulse'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-gray-400'
  }
}

function sshLabel(status: string | undefined): string {
  switch (status) {
    case 'connected':
      return t('admin.sysconfig.page.cluster_node_ssh_connected') as string
    case 'connecting':
      return t('admin.sysconfig.page.cluster_node_ssh_connecting') as string
    case 'reconnecting':
      return t('admin.sysconfig.page.cluster_node_ssh_reconnecting') as string
    case 'error':
      return t('admin.sysconfig.page.cluster_node_ssh_error') as string
    default:
      return t('admin.sysconfig.page.cluster_node_ssh_unknown') as string
  }
}
</script>
