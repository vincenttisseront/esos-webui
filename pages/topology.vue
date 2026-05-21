<template>
  <div class="topology-wrapper">
    <!-- Toolbar -->
    <div class="topology-toolbar">
      <!-- Retour -->
      <NuxtLink
        to="/"
        class="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 dark:text-gray-400 border border-gray-300 transition shrink-0"
      >
        {{ t('topology.toolbar.back') }}
      </NuxtLink>

      <span class="font-semibold text-sm text-gray-700 dark:text-gray-200 shrink-0">{{ t('topology.toolbar.title') }}</span>

      <!-- Sélecteur SAN (multi-SAN uniquement) -->
      <div v-if="sanSelector.isMultiSan.value" class="flex items-center gap-1 overflow-x-auto">
        <button
          class="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors shrink-0"
          :class="sanSelector.isAll.value
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'"
          @click="switchSan(ALL_SANS_ID)"
        >
          {{ t('topology.toolbar.allSans') }}
        </button>
        <button
          v-for="san in sanSelector.activeSans.value"
          :key="san.id"
          class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors shrink-0"
          :class="!sanSelector.isAll.value && sanSelector.selected.value?.id === san.id
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'"
          @click="switchSan(san.id)"
        >
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="{
              'bg-green-400': sanSelector.sshStatuses.value[san.id] === 'connected',
              'bg-orange-400': sanSelector.sshStatuses.value[san.id] === 'reconnecting',
              'bg-red-500': sanSelector.sshStatuses.value[san.id] === 'error',
              'bg-gray-400': !sanSelector.sshStatuses.value[san.id],
            }"
          />
          <span class="font-mono">{{ san.label }}</span>
        </button>
      </div>

      <button
        class="ml-auto text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-700 border border-blue-200 transition shrink-0"
        :disabled="loading"
        @click="refresh"
      >
        {{ loading ? t('topology.toolbar.loading') : t('topology.toolbar.refresh') }}
      </button>
    </div>

    <!-- Légende -->
    <div class="topology-legend">
      <span class="legend-item"><span class="legend-dot bg-gray-400"></span>{{ t('topology.legend.hba') }}</span>
      <span class="legend-item"><span class="legend-dot bg-blue-400"></span>{{ t('topology.legend.fcTarget') }}</span>
      <span class="legend-item"><span class="legend-dot bg-purple-400"></span>{{ t('topology.legend.accessGroup') }}</span>
      <span class="legend-item"><span class="legend-dot bg-orange-400"></span>{{ t('topology.legend.initiator') }}</span>
      <span class="legend-item"><span class="legend-dot bg-teal-400"></span>{{ t('topology.legend.volume') }}</span>
    </div>

    <!-- Statut -->
    <div class="topology-status">
      <span v-if="nodes.length === 0" class="text-gray-400">{{ t('topology.status.noNodes') }}</span>
      <span v-else>{{ t('topology.status.summary', { nodes: nodes.length, edges: edges.length }) }}</span>
    </div>

    <!-- Vue Flow -->
    <VueFlow
      v-if="nodes.length > 0"
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      fit-view-on-init
      class="w-full h-full"
    >
      <Background />
      <Controls />
      <MiniMap />
    </VueFlow>

    <!-- Placeholder vide -->
    <div v-else-if="!loading" class="flex items-center justify-center w-full h-full text-gray-400">
      <div class="text-center">
        <div class="text-5xl mb-4">🗺️</div>
        <p class="text-lg font-medium">{{ t('topology.empty.title') }}</p>
        <p class="text-sm mt-1">{{ t('topology.empty.hint') }}</p>
      </div>
    </div>

    <!-- Chargement initial -->
    <div v-else class="flex items-center justify-center w-full h-full text-gray-400">
      <div class="text-center">
        <div class="text-3xl mb-3 animate-spin">↻</div>
        <p>{{ t('topology.loading') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { VueFlow }   from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls }  from '@vue-flow/controls'
import { MiniMap }   from '@vue-flow/minimap'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '~/assets/css/topology.css'

import HbaPortNode     from '~/components/topology/nodes/HbaPortNode.vue'
import FCTargetNode    from '~/components/topology/nodes/FCTargetNode.vue'
import FCInitiatorNode from '~/components/topology/nodes/FCInitiatorNode.vue'
import SCSTGroupNode   from '~/components/topology/nodes/SCSTGroupNode.vue'
import SCSTDeviceNode  from '~/components/topology/nodes/SCSTDeviceNode.vue'

import { useTopologyGraph } from '~/composables/useTopologyGraph'
import { useOverviewStore } from '~/stores/overview'
import { useHardwareStore } from '~/stores/hardware'
import { ALL_SANS_ID } from '~/composables/useSelectedSan'

definePageMeta({ layout: 'fullscreen' })

const { t } = useEsosI18n()

// ── Stores ──────────────────────────────────────────────────────────────────
const overviewStore = useOverviewStore()
const hwStore       = useHardwareStore()
const sanSelector   = useSelectedSan()

const overview = computed(() => overviewStore.data)
const fcPorts  = computed(() => hwStore.data?.fcPorts ?? [])
const loading  = computed(() => overviewStore.loading || hwStore.loading)

// ── Graph ────────────────────────────────────────────────────────────────────
const { nodes, edges } = useTopologyGraph(overview, fcPorts)

// ── Node types ───────────────────────────────────────────────────────────────
const nodeTypes = {
  'hba-port':     HbaPortNode,
  'fc-target':    FCTargetNode,
  'fc-initiator': FCInitiatorNode,
  'scst-group':   SCSTGroupNode,
  'scst-device':  SCSTDeviceNode,
}

// ── Refresh ───────────────────────────────────────────────────────────────────
async function refresh() {
  await Promise.all([
    overviewStore.fetch(),
    hwStore.fetch(),
  ])
}

// ── SAN switch ───────────────────────────────────────────────────────────────
async function switchSan(id: string) {
  if (id === ALL_SANS_ID) {
    sanSelector.selectAll()
  } else {
    sanSelector.select(id)
  }
  overviewStore.invalidate()
  hwStore.$patch({ data: null, alerts: [] })
  await Promise.all([overviewStore.fetch(), hwStore.fetch()])
}

// ── Polling 15 s ─────────────────────────────────────────────────────────────
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  refresh()
  timer = setInterval(refresh, 15_000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>
