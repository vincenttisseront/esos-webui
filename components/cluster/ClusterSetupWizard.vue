<template>
  <div class="space-y-5">

    <!-- Stepper -->
    <div class="flex items-center">
      <template v-for="(step, i) in STEPS" :key="i">
        <div
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="stepCls(i)"
        >
          <span
            class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
            :class="circleCls(i)"
          >
            <UIcon v-if="stepState[i] === 'done'" name="i-heroicons-check" class="w-3 h-3" />
            <span v-else>{{ i + 1 }}</span>
          </span>
          {{ step }}
        </div>
        <div v-if="i < STEPS.length - 1" class="flex-1 h-px bg-gray-200 mx-1 min-w-[12px]" />
      </template>
    </div>

    <!-- Contenu -->
    <div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <!-- Étape 0 : Sélection des nœuds -->
      <ClusterNodeSelector
        v-if="current === 0"
        @nodes-selected="onNodesSelected"
      />
      <ClusterPrereqCheck
        v-else-if="current === 1"
        :nodes="selectedNodes"
        @all-ok="advance(1)"
      />
      <ClusterServicesSetup
        v-else-if="current === 2"
        :nodes="selectedNodes"
        @services-ready="advance(2)"
      />
      <ClusterQuorumCheck
        v-else-if="current === 3"
        :nodes="selectedNodes"
        @quorum-ok="advance(3)"
      />
      <ClusterSyncStep
        v-else-if="current === 4"
        :nodes="selectedNodes"
        @synced="advance(4)"
      />
      <ClusterFinalizeStep
        v-else-if="current === 5"
        :nodes="selectedNodes"
        :initial-cluster-id="selectedClusterId"
        :initial-cluster-name="selectedClusterName"
        :removed-nodes="removedNodes"
        @finalized="advance(5)"
      />
    </div>

    <!-- Navigation -->
    <div class="flex justify-between">
      <UButton
        v-if="current > 0"
        color="gray" variant="ghost"
        icon="i-heroicons-arrow-left"
        label="Précédent"
        @click="current--"
      />
      <div class="flex-1" />
      <UButton
        v-if="current === 4 && stepState[4] === 'done'"
        icon="i-heroicons-check"
        label="Terminer la configuration"
        trailing
        color="green"
        @click="advance(4)"
      />
      <UButton
        v-else-if="current < STEPS.length - 1 && current !== 4 && stepState[current] === 'done'"
        icon="i-heroicons-arrow-right"
        label="Suivant"
        trailing
        @click="current++"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
interface NodeInfo { id: string; label: string; host: string }

const emit = defineEmits<{ (e: 'setup-complete'): void }>()

const STEPS = ['Nœuds', 'Prérequis', 'Services', 'Quorum', 'Sync', 'Finalisation']

const current             = ref(0)
const stepState           = ref<('pending' | 'done')[]>(['pending', 'pending', 'pending', 'pending', 'pending', 'pending'])
const selectedNodes       = ref<NodeInfo[]>([])
const selectedClusterId   = ref<string | null>(null)
const selectedClusterName = ref<string | null>(null)
const removedNodes        = ref<NodeInfo[]>([])

function onNodesSelected(nodes: NodeInfo[], clusterId: string | null, clusterName: string | null, removed: NodeInfo[]) {
  selectedNodes.value       = nodes
  selectedClusterId.value   = clusterId
  selectedClusterName.value = clusterName
  removedNodes.value        = removed
  advance(0)
}

function advance(step: number) {
  stepState.value[step] = 'done'
  if (step < STEPS.length - 1) {
    current.value = step + 1
  } else {
    emit('setup-complete')
  }
}

function stepCls(i: number) {
  if (i === current.value)           return 'text-blue-600 bg-blue-50'
  if (stepState.value[i] === 'done') return 'text-green-700'
  return 'text-gray-400'
}

function circleCls(i: number) {
  if (stepState.value[i] === 'done') return 'bg-green-100 text-green-600'
  if (i === current.value)           return 'bg-blue-600 text-white'
  return 'bg-gray-200 text-gray-400'
}
</script>
