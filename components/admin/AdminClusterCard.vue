<script setup lang="ts">
import { useNetworkPendingRestart } from '~/composables/useNetworkPendingRestart'
import type { ClusterOverview } from '~/server/utils/types'

const { isPending } = useNetworkPendingRestart()
const { t } = useEsosI18n()

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
type StorageRoute = 'raid' | 'system-config' | 'performance'

const props = defineProps<{
  clusterId: string
  clusterName: string
  nodes: SanRow[]
  overview?: ClusterOverview
  liveStatuses: Record<string, SSHStatus>
  isViewer: boolean
  testing: Record<string, boolean>
  reconnecting: Record<string, boolean>
  toggling: Record<string, boolean>
  syncing?: boolean
  probing?: boolean
}>()

const emit = defineEmits<{
  (e: 'configure', clusterId: string): void
  (e: 'monitor', clusterId: string): void
  (e: 'testAll', clusterId: string): void
  (e: 'reconnectAll', clusterId: string): void
  (e: 'sync', clusterId: string): void
  (e: 'probe', clusterId: string): void
  (e: 'storage', payload: { clusterId: string; nodeId: string; route: StorageRoute }): void
  (e: 'testNode', id: string): void
  (e: 'reconnectNode', id: string): void
  (e: 'deleteNode', id: string): void
  (e: 'toggleReadOnly', san: SanRow): void
}>()

const primaryNode = computed(() =>
  props.nodes.find(n => n.clusterRole === 'primary'),
)

const hasPrimaryNode = computed(() => Boolean(primaryNode.value))

const secondaryNodes = computed(() =>
  props.nodes.filter(n => n.id !== primaryNode.value?.id),
)

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
]])

function emitStorage(route: StorageRoute) {
  if (!primaryNode.value) return
  emit('storage', {
    clusterId: props.clusterId,
    nodeId: primaryNode.value.id,
    route,
  })
}

const allConnected = computed(() =>
  props.nodes.length > 0 && props.nodes.every(n => props.liveStatuses[n.id] === 'connected'),
)

const dbSummary = computed(() => {
  if (props.nodes.every(n => n.status === 'active')) return 'Tous actifs'
  if (props.nodes.every(n => n.status === 'inactive')) return 'Tous inactifs'
  return 'Mixte'
})

const webEditingSummary = computed(() => {
  if (props.nodes.every(n => !n.readOnly)) return 'Tous éditables'
  if (props.nodes.every(n => n.readOnly)) return 'Tous lecture seule'
  return 'Mixte'
})

const mode = computed(() => props.overview?.mode ?? 'unknown')
const healthy = computed(() => props.overview?.healthy)

function modeColor(mode: string) {
  if (mode === 'active-active') return 'green'
  if (mode === 'active-passive') return 'blue'
  if (mode === 'resyncing') return 'amber'
  if (mode === 'degraded' || mode === 'split-brain') return 'red'
  return 'gray'
}

function healthColor() {
  if (healthy.value === true) return 'green'
  if (healthy.value === false) return 'red'
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
        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <UIcon name="i-heroicons-server-stack" class="w-5 h-5 text-indigo-500" />
            <h3 class="font-semibold text-gray-900">{{ clusterName }}</h3>
            <UBadge color="indigo" variant="subtle" size="xs">HA</UBadge>
            <UBadge :color="modeColor(mode)" variant="soft" size="xs">{{ mode }}</UBadge>
            <UBadge :color="healthColor()" variant="soft" size="xs">
              {{ healthy === undefined ? t('admin.sans.cluster_card.health_unknown') : healthy ? t('admin.sans.cluster_card.healthy') : t('admin.sans.cluster_card.degraded') }}
            </UBadge>
            <UBadge v-if="!hasPrimaryNode" color="yellow" variant="soft" size="xs">
              {{ t('admin.sans.cluster_card.no_primary') }}
            </UBadge>
          </div>
          <p class="text-xs text-gray-500">
            {{ t('admin.sans.cluster_card.description') }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2 justify-end">
          <UButton size="xs" color="indigo" variant="soft" icon="i-heroicons-wrench-screwdriver" @click="emit('configure', clusterId)">
            {{ t('admin.sans.cluster_card.configure_ha') }}
          </UButton>
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
          <UButton size="xs" color="blue" variant="soft" icon="i-heroicons-chart-bar-square" @click="emit('monitor', clusterId)">
            {{ t('admin.sans.cluster_card.monitor') }}
          </UButton>
          <template v-if="!isViewer">
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
          </template>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{{ t('admin.sans.cluster_card.primary') }}</p>
          <p class="text-sm font-medium text-gray-800">{{ primaryNode?.label ?? '—' }}</p>
          <p class="text-xs font-mono text-gray-500">{{ primaryNode ? `${primaryNode.host}:${primaryNode.port}` : '—' }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{{ t('admin.sans.cluster_card.secondaries') }}</p>
          <p class="text-sm font-medium text-gray-800">
            {{ secondaryNodes.length ? secondaryNodes.map(n => n.label).join(', ') : '—' }}
          </p>
          <p class="text-xs text-gray-500">{{ t('admin.sans.cluster_card.node_count', { count: nodes.length }) }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{{ t('admin.sans.cluster_card.connections') }}</p>
          <p class="text-sm font-medium" :class="allConnected ? 'text-green-600' : 'text-amber-600'">
            {{ allConnected ? t('admin.sans.cluster_card.all_connected') : t('admin.sans.cluster_card.check_connections') }}
          </p>
          <p class="text-xs text-gray-500">{{ t('admin.sans.cluster_card.db_summary', { value: dbSummary }) }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{{ t('admin.sans.cluster_card.web_editing') }}</p>
          <p class="text-sm font-medium" :class="webEditingSummary === 'Tous éditables' ? 'text-primary-600' : 'text-gray-600'">
            {{ webEditingSummary }}
          </p>
          <p class="text-xs text-gray-500">{{ t('admin.sans.cluster_card.per_node_setting') }}</p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-xs text-gray-400 uppercase tracking-wider border-b">
            <tr>
              <th class="py-2 pr-4">{{ t('admin.sans.cluster_card.node') }}</th>
              <th class="pr-4">Host</th>
              <th class="pr-4">{{ t('admin.sans.cluster_card.role') }}</th>
              <th class="pr-4">{{ t('admin.sans.cluster_card.connection') }}</th>
              <th class="pr-4">DB</th>
              <th class="pr-4">{{ t('admin.sans.cluster_card.web_editing') }}</th>
              <th class="text-right">{{ t('admin.sans.cluster_card.node_diagnostics') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="node in nodes" :key="node.id" class="hover:bg-gray-50 transition-colors">
              <td class="py-3 pr-4">
                <div class="font-medium text-gray-900 flex items-center gap-1.5">
                  {{ node.label }}
                  <UTooltip v-if="isPending(node.id).value" text="Configuration réseau enregistrée mais non appliquée — redémarrage requis">
                    <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-orange-500 shrink-0" />
                  </UTooltip>
                </div>
                <div v-if="node.description" class="text-xs text-gray-400">{{ node.description }}</div>
              </td>
              <td class="pr-4 font-mono text-xs text-gray-600">{{ node.host }}:{{ node.port }}</td>
              <td class="pr-4">
                <UBadge :color="node.clusterRole === 'primary' ? 'blue' : 'indigo'" variant="subtle" size="xs">
                  {{ roleLabel(node.clusterRole) }}
                </UBadge>
              </td>
              <td class="pr-4">
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full shrink-0" :class="liveStatusDot(liveStatuses[node.id])" />
                  <span class="text-xs" :class="liveStatusTextColor(liveStatuses[node.id])">
                    {{ liveStatusLabel(liveStatuses[node.id]) }}
                  </span>
                </div>
              </td>
              <td class="pr-4">
                <UBadge :color="statusColor(node.status)" variant="subtle" size="xs">{{ node.status }}</UBadge>
              </td>
              <td class="pr-4">
                <div class="flex items-center gap-1.5">
                  <span
                    v-if="!isViewer"
                    class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent cursor-pointer"
                    :class="node.readOnly ? 'bg-gray-200' : 'bg-primary-500'"
                    title="Paramètre par nœud"
                    @click="emit('toggleReadOnly', node)"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform"
                      :class="node.readOnly ? 'translate-x-0' : 'translate-x-4'"
                    />
                  </span>
                  <span class="text-xs" :class="node.readOnly ? 'text-gray-400' : 'text-primary-600 font-medium'">
                    {{ node.readOnly ? 'Lecture seule' : 'Éditable' }}
                  </span>
                </div>
              </td>
              <td class="text-right space-x-1">
                <UButton
                  v-if="!isViewer"
                  size="xs"
                  variant="ghost"
                  icon="i-heroicons-bolt"
                  :loading="testing[node.id]"
                  @click="emit('testNode', node.id)"
                >
                  Test
                </UButton>
                <UButton
                  v-if="!isViewer"
                  size="xs"
                  variant="ghost"
                  icon="i-heroicons-arrow-path"
                  :loading="reconnecting[node.id]"
                  @click="emit('reconnectNode', node.id)"
                >
                  Reconnecter
                </UButton>
                <UButton
                  v-if="!isViewer"
                  size="xs"
                  variant="ghost"
                  color="red"
                  icon="i-heroicons-trash"
                  @click="emit('deleteNode', node.id)"
                />
                <span v-if="isViewer" class="text-xs text-gray-400 italic">Lecture seule</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </UCard>
</template>
