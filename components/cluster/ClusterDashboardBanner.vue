<template>
  <div
    class="rounded-xl border px-5 py-4 flex items-center gap-4"
    :class="clusterStatus?.healthy ? 'bg-green-50 dark:bg-green-950/40 border-green-200' : clusterStatus ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' : 'bg-indigo-50 border-indigo-200'"
  >
    <!-- Icône -->
    <div
      class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
      :class="clusterStatus?.healthy ? 'bg-green-100' : clusterStatus ? 'bg-amber-100' : 'bg-indigo-100'"
    >
      <UIcon
        :name="clusterStatus?.healthy ? 'i-heroicons-check-circle' : 'i-heroicons-server-stack'"
        class="w-5 h-5"
        :class="clusterStatus?.healthy ? 'text-green-500' : clusterStatus ? 'text-amber-500' : 'text-indigo-400'"
      />
    </div>

    <!-- Infos cluster -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <p class="text-sm font-semibold" :class="clusterStatus?.healthy ? 'text-green-800' : 'text-gray-800 dark:text-gray-200'">
          {{ cluster.name }}
        </p>
        <span
          class="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide"
          :class="modeClasses"
        >{{ modeLabel }}</span>
      </div>
      <p class="text-xs mt-0.5 text-gray-500 dark:text-gray-400">
        {{ t('dashboard.clusterBanner.nodesLine', { count: cluster.nodes.length }) }} ·
        {{ t('dashboard.clusterBanner.primaryStats') }}
        <template v-if="primaryNode"> · <span class="font-medium font-mono">{{ primaryNode.label }}</span></template>
      </p>
    </div>

    <!-- Nœuds (dots SSH) -->
    <div class="flex items-center gap-1.5 shrink-0">
      <UTooltip
        v-for="node in cluster.nodes"
        :key="node.id"
        :text="`${node.label} — ${sshStatuses[node.id] ?? t('dashboard.clusterBanner.sshUnknown')}`"
      >
        <span
          class="w-2 h-2 rounded-full"
          :class="{
            'bg-green-400':              sshStatuses[node.id] === 'connected',
            'bg-orange-400 animate-pulse': sshStatuses[node.id] === 'reconnecting',
            'bg-red-500':                sshStatuses[node.id] === 'error',
            'bg-gray-300':               !sshStatuses[node.id] || sshStatuses[node.id] === 'connecting',
          }"
        />
      </UTooltip>
    </div>

    <!-- Lien monitoring -->
    <UButton
      to="/cluster"
      icon="i-heroicons-chart-bar"
      size="xs"
      color="indigo"
      variant="soft"
      :label="t('dashboard.clusterBanner.monitoringCta')"
    />
  </div>
</template>

<script setup lang="ts">
import type { ClusterSelectionDto } from '~/server/utils/selection-context'

const props = defineProps<{ cluster: ClusterSelectionDto }>()
const { t, te } = useEsosI18n()
const { sshStatuses } = useSelectedSan()

const clusterStatus = ref<{ healthy: boolean; mode: string } | null>(null)

// Charge le statut cluster (silencieux)
onMounted(async () => {
  try {
    const ids = props.cluster.nodes.map(n => n.id).join(',')
    const status = await $fetch<{ healthy: boolean; mode: string }>('/api/cluster/status', {
      query: { nodeIds: ids },
    })
    clusterStatus.value = status
  } catch { /* silencieux */ }
})

const primaryNode = computed(() =>
  props.cluster.nodes.find(n => n.clusterRole === 'primary'),
)

const modeLabel = computed(() => {
  if (!clusterStatus.value) return t('dashboard.clusterBanner.modeDefaultHa')
  const mode = clusterStatus.value.mode
  const key = `dashboard.clusterBanner.modes.${mode}`
  return te(key) ? (t(key) as string) : mode
})

const modeClasses = computed(() => {
  const mode = clusterStatus.value?.mode
  if (mode === 'active-active')  return 'bg-blue-100 text-blue-700'
  if (mode === 'active-passive') return 'bg-indigo-100 text-indigo-700'
  if (mode === 'degraded')       return 'bg-red-100 text-red-700'
  if (mode === 'resyncing')      return 'bg-blue-100 text-blue-700'
  if (mode === 'split-brain')    return 'bg-red-200 text-red-800 font-bold animate-pulse'
  return 'bg-gray-100 text-gray-500'
})
</script>
