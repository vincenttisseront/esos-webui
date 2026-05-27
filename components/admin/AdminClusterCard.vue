<script setup lang="ts">
import { useNetworkPendingRestart } from '~/composables/useNetworkPendingRestart'
import { useClusterAttentionAction, type ClusterAttentionActionHandlers } from '~/composables/useClusterAttentionAction'
import type { ClusterAttentionResponse } from '~/types/cluster-admin'
import type { ClusterOverview } from '~/server/utils/types'

interface SanRow {
  id: string
  label: string
  description: string | null
  host: string
  port: number
  username: string
  driver: string
  status: string
  authType: 'key' | 'password'
  readOnly: boolean
  clusterEnabled: boolean
  clusterRole: string | null
  clusterId: string | null
}

type SSHStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'
type StorageRoute = 'raid' | 'system-config' | 'performance' | 'advanced-storage'

const props = defineProps<{
  clusterId: string
  clusterName: string
  nodes: SanRow[]
  overview?: ClusterOverview
  attention?: ClusterAttentionResponse | null
  liveStatuses: Record<string, SSHStatus>
  isViewer: boolean
  testing: Record<string, boolean>
  reconnecting: Record<string, boolean>
  toggling: Record<string, boolean>
  syncing?: boolean
  probing?: boolean
  actionHandlers?: ClusterAttentionActionHandlers
}>()

const emit = defineEmits<{
  (e: 'configure', clusterId: string): void
  (e: 'monitor', clusterId: string): void
  (e: 'systemConfig', payload: { clusterId: string; nodeId: string }): void
  (e: 'testAll', clusterId: string): void
  (e: 'reconnectAll', clusterId: string): void
  (e: 'sync', clusterId: string): void
  (e: 'probe', clusterId: string): void
  (e: 'storage', payload: { clusterId: string; nodeId: string; route: StorageRoute }): void
  (e: 'testNode', id: string): void
  (e: 'reconnectNode', id: string): void
  (e: 'removeNode', id: string): void
  (e: 'toggleReadOnly', san: SanRow): void
  (e: 'addNode', clusterId: string): void
}>()

const { isPending } = useNetworkPendingRestart()
const { t } = useEsosI18n()
const { handleAttentionAction } = useClusterAttentionAction(props.actionHandlers ?? {})

const primaryNode = computed(() =>
  props.nodes.find(n => n.clusterRole === 'primary'),
)

const hasPrimaryNode = computed(() => Boolean(primaryNode.value))

const secondaryNodes = computed(() =>
  props.nodes.filter(n => n.id !== primaryNode.value?.id),
)

const clusterHealth = computed(() => props.attention?.health)

const attentionPoints = computed(() =>
  (props.attention?.attentionPoints ?? []).filter(p => p.severity !== 'info'),
)

const showAttention = computed(() =>
  props.attention?.health === 'warning' || props.attention?.health === 'critical',
)

const storageKpi = computed(() => {
  const o = props.attention?.storageOverall
  if (!o || o === 'ok') return { label: t('cluster.storage.ok'), class: 'text-green-600' }
  if (o === 'critical') return { label: t('cluster.storage.critical'), class: 'text-red-600' }
  if (o === 'warning') return { label: t('cluster.storage.warning'), class: 'text-amber-600' }
  return { label: t('cluster.storage.unknown'), class: 'text-gray-500' }
})

const servicesKpi = computed(() => {
  if (!props.overview) return { label: '—', class: 'text-gray-500' }
  const ok = props.overview.healthy
  return ok
    ? { label: t('cluster.services.ok'), class: 'text-green-600' }
    : { label: t('cluster.services.degraded'), class: 'text-amber-600' }
})

const storageMenuItems = computed(() => [[
  {
    label: t('admin.sans.cluster_card.storage_raid'),
    icon: 'i-heroicons-circle-stack',
    disabled: !hasPrimaryNode.value,
    onSelect: () => emitStorage('raid'),
  },
  {
    label: t('admin.sans.cluster_card.storage_system'),
    icon: 'i-heroicons-wrench-screwdriver',
    disabled: !hasPrimaryNode.value,
    onSelect: () => emitStorage('system-config'),
  },
  {
    label: t('admin.sans.cluster_card.storage_performance'),
    icon: 'i-heroicons-bolt',
    disabled: !hasPrimaryNode.value,
    onSelect: () => emitStorage('performance'),
  },
  {
    label: t('admin.sans.cluster_card.storage_advanced'),
    icon: 'i-heroicons-squares-plus',
    disabled: !hasPrimaryNode.value,
    onSelect: () => emitStorage('advanced-storage'),
  },
]])

function emitStorage(route: StorageRoute) {
  if (!primaryNode.value) return
  emit('storage', {
    clusterId: props.clusterId,
    nodeId: primaryNode.value.id,
    route,
  })
}

function emitSystemConfig() {
  if (!primaryNode.value) return
  emit('systemConfig', {
    clusterId: props.clusterId,
    nodeId: primaryNode.value.id,
  })
}

const nodesUp = computed(() =>
  props.nodes.filter(n => props.liveStatuses[n.id] === 'connected').length,
)

const mode = computed(() => props.overview?.mode ?? 'unknown')

function modeColor(m: string) {
  if (m === 'active-active') return 'green'
  if (m === 'active-passive') return 'blue'
  if (m === 'resyncing') return 'amber'
  if (m === 'degraded' || m === 'split-brain') return 'red'
  return 'gray'
}

function statusColor(status: string) {
  switch (status) {
    case 'active': return 'green'
    case 'inactive': return 'gray'
    case 'maintenance': return 'yellow'
    default: return 'gray'
  }
}

function roleLabel(role: string | null) {
  if (role === 'primary') return t('admin.sans.cluster_card.primary')
  if (role === 'secondary') return t('admin.sans.cluster_card.secondary')
  return '—'
}

function liveStatusLabel(s: SSHStatus | undefined): string {
  switch (s) {
    case 'connected': return 'Connecté'
    case 'connecting': return 'Connexion…'
    case 'reconnecting': return 'Reconnexion…'
    case 'error': return 'Erreur'
    default: return 'Non initialisé'
  }
}

function liveStatusDot(s: SSHStatus | undefined): string {
  switch (s) {
    case 'connected': return 'bg-green-400'
    case 'connecting': return 'bg-yellow-400 animate-pulse'
    case 'reconnecting': return 'bg-orange-400 animate-pulse'
    case 'error': return 'bg-red-400'
    default: return 'bg-gray-300'
  }
}

function liveStatusTextColor(s: SSHStatus | undefined): string {
  switch (s) {
    case 'connected': return 'text-green-600'
    case 'connecting': return 'text-yellow-600'
    case 'reconnecting': return 'text-orange-600'
    case 'error': return 'text-red-600'
    default: return 'text-gray-400'
  }
}
</script>

<template>
  <UCard class="overflow-hidden">
    <template #header>
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="space-y-1 min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <UIcon name="i-heroicons-server-stack" class="w-5 h-5 text-indigo-500 shrink-0" />
            <h3 class="font-semibold text-gray-900 dark:text-gray-100 truncate">{{ clusterName }}</h3>
            <UBadge color="indigo" variant="subtle" size="xs">HA</UBadge>
            <ClusterHealthBadge :health="clusterHealth" />
            <UBadge v-if="overview" :color="modeColor(mode)" variant="soft" size="xs">{{ mode }}</UBadge>
            <UBadge v-if="!hasPrimaryNode" color="yellow" variant="soft" size="xs">
              {{ t('admin.sans.cluster_card.no_primary') }}
            </UBadge>
          </div>
          <p v-if="attention?.probeError" class="text-xs text-red-600">{{ attention.probeError }}</p>
        </div>
        <div class="flex flex-wrap gap-2 justify-end shrink-0">
          <UButton size="xs" color="blue" variant="soft" icon="i-heroicons-chart-bar-square" @click="emit('monitor', clusterId)">
            {{ t('admin.sans.cluster_card.monitor') }}
          </UButton>
          <UButton size="xs" color="indigo" variant="soft" icon="i-heroicons-wrench-screwdriver" @click="emit('configure', clusterId)">
            {{ t('admin.sans.cluster_card.configure_ha') }}
          </UButton>
          <UTooltip
            v-if="!isViewer"
            :text="hasPrimaryNode ? t('admin.sans.cluster_card.system_config_hint') : t('admin.sans.cluster_card.no_primary_storage')"
          >
            <span class="inline-flex">
              <UButton
                size="xs"
                color="gray"
                variant="soft"
                icon="i-heroicons-cog-6-tooth"
                :disabled="!hasPrimaryNode"
                @click="emitSystemConfig"
              >
                {{ t('admin.sans.cluster_card.system_config') }}
              </UButton>
            </span>
          </UTooltip>
          <UTooltip v-if="!isViewer" :text="hasPrimaryNode ? t('admin.sans.cluster_card.configure_storage') : t('admin.sans.cluster_card.no_primary_storage')">
            <span class="inline-flex">
              <UDropdownMenu
                :items="storageMenuItems"
                :content="{ side: 'bottom', align: 'end' }"
                :disabled="!hasPrimaryNode"
              >
                <UButton
                  v-if="!isViewer"
                  size="xs"
                  color="primary"
                  variant="soft"
                  icon="i-heroicons-circle-stack"
                  trailing-icon="i-heroicons-chevron-down"
                  :disabled="!hasPrimaryNode"
                >
                  {{ t('admin.sans.cluster_card.storage') }}
                </UButton>
              </UDropdownMenu>
            </span>
          </UTooltip>
          <UButton
            v-if="!isViewer"
            size="xs"
            color="gray"
            variant="outline"
            icon="i-heroicons-user-plus"
            @click="emit('addNode', clusterId)"
          >
            {{ t('cluster.add_node.short') }}
          </UButton>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div class="rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 px-2.5 py-2">
          <p class="text-[10px] uppercase text-gray-400 font-semibold">{{ t('admin.sans.cluster_card.primary') }}</p>
          <p class="font-medium text-gray-800 dark:text-gray-200 truncate">{{ primaryNode?.label ?? '—' }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 px-2.5 py-2">
          <p class="text-[10px] uppercase text-gray-400 font-semibold">{{ t('admin.sans.cluster_card.connections') }}</p>
          <p class="font-medium" :class="nodesUp === nodes.length ? 'text-green-600' : 'text-amber-600'">
            {{ nodesUp }}/{{ nodes.length }}
          </p>
        </div>
        <div class="rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 px-2.5 py-2">
          <p class="text-[10px] uppercase text-gray-400 font-semibold">{{ t('cluster.storage.title') }}</p>
          <p class="font-medium truncate" :class="storageKpi.class">{{ storageKpi.label }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 px-2.5 py-2">
          <p class="text-[10px] uppercase text-gray-400 font-semibold">{{ t('cluster.services.title') }}</p>
          <p class="font-medium" :class="servicesKpi.class">{{ servicesKpi.label }}</p>
        </div>
      </div>

      <ClusterAttentionPanel
        v-if="showAttention"
        :points="attentionPoints"
        :max-visible="3"
        @action="handleAttentionAction"
      />

      <details class="rounded-lg border border-gray-200 dark:border-gray-700">
        <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 select-none list-none">
          {{ t('cluster.nodes_section', { count: nodes.length }) }}
        </summary>
        <div class="px-3 pb-3 border-t border-gray-100 dark:border-gray-800">
          <div class="flex flex-wrap gap-2 py-2 border-b border-gray-100 dark:border-gray-800 mb-2" v-if="!isViewer">
            <UButton size="xs" color="gray" variant="outline" icon="i-heroicons-bolt" @click="emit('testAll', clusterId)">
              {{ t('admin.sans.cluster_card.test_all') }}
            </UButton>
            <UButton size="xs" color="gray" variant="outline" icon="i-heroicons-arrow-path" @click="emit('reconnectAll', clusterId)">
              {{ t('admin.sans.cluster_card.reconnect_all') }}
            </UButton>
            <UButton size="xs" color="gray" variant="outline" icon="i-heroicons-arrow-path-rounded-square" :loading="syncing" @click="emit('sync', clusterId)">
              {{ t('admin.sans.cluster_card.sync_config') }}
            </UButton>
            <UButton size="xs" color="gray" variant="outline" icon="i-heroicons-magnifying-glass" :loading="probing" @click="emit('probe', clusterId)">
              {{ t('admin.sans.cluster_card.probe') }}
            </UButton>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-xs text-gray-400 uppercase border-b">
                <tr>
                  <th class="py-2 pr-4">{{ t('admin.sans.cluster_card.node') }}</th>
                  <th class="pr-4">Host</th>
                  <th class="pr-4">{{ t('admin.sans.cluster_card.role') }}</th>
                  <th class="pr-4">{{ t('admin.sans.cluster_card.connection') }}</th>
                  <th class="text-right">{{ t('admin.sans.cluster_card.node_diagnostics') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="node in nodes" :key="node.id" class="hover:bg-gray-50 dark:bg-gray-950">
                  <td class="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">
                    {{ node.label }}
                    <UTooltip v-if="isPending(node.id).value" text="Redémarrage réseau requis">
                      <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-orange-500 inline" />
                    </UTooltip>
                  </td>
                  <td class="pr-4 font-mono text-xs">{{ node.host }}:{{ node.port }}</td>
                  <td class="pr-4">
                    <UBadge :color="node.clusterRole === 'primary' ? 'blue' : 'indigo'" size="xs" variant="subtle">
                      {{ roleLabel(node.clusterRole) }}
                    </UBadge>
                  </td>
                  <td class="pr-4">
                    <span class="inline-flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full" :class="liveStatusDot(liveStatuses[node.id])" />
                      <span class="text-xs" :class="liveStatusTextColor(liveStatuses[node.id])">
                        {{ liveStatusLabel(liveStatuses[node.id]) }}
                      </span>
                    </span>
                  </td>
                  <td class="text-right space-x-1">
                    <UButton v-if="!isViewer" size="xs" variant="ghost" icon="i-heroicons-bolt" :loading="testing[node.id]" @click="emit('testNode', node.id)" />
                    <UButton v-if="!isViewer" size="xs" variant="ghost" icon="i-heroicons-arrow-path" :loading="reconnecting[node.id]" @click="emit('reconnectNode', node.id)" />
                    <UButton
                      v-if="!isViewer && nodes.length > 1"
                      size="xs"
                      variant="ghost"
                      color="amber"
                      icon="i-heroicons-user-minus"
                      :title="t('cluster.remove_node.title')"
                      @click="emit('removeNode', node.id)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  </UCard>
</template>
