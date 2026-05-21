<template>
  <div class="space-y-3">
    <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('lvm.cluster.wizard.mapping_hint') }}</p>
    <div
      v-for="peer in peerNodes"
      :key="peer.sanId"
      class="rounded border border-gray-200 dark:border-gray-700 p-3 space-y-2"
    >
      <div class="text-sm font-medium">{{ peer.label }}</div>
      <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">{{ sourcePath }} →</div>
      <LvmNativeSelect
        :model-value="mappingForPeer(peer.sanId)"
        :options="peerCandidateOptions(peer)"
        :placeholder="t('lvm.wizard.select_placeholder')"
        @update:model-value="v => setMapping(peer.sanId, v)"
      />
      <p v-if="mappingBlocker(peer.sanId)" class="text-xs text-red-600">{{ mappingBlocker(peer.sanId) }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClusterLvmDiskMapping, ClusterLvmNodeInventory } from '~/types/lvm'

const props = defineProps<{
  sourceSanId: string
  sourcePath: string
  inventory: ClusterLvmNodeInventory[]
  mappings: ClusterLvmDiskMapping[]
}>()
const emit = defineEmits<{ 'update:mappings': [ClusterLvmDiskMapping[]] }>()
const { t } = useEsosI18n()

const peerNodes = computed(() => props.inventory.filter(n => n.sanId !== props.sourceSanId))

function mappingForPeer(peerSanId: string): string {
  return props.mappings.find(m => m.peerSanId === peerSanId && m.sourcePath === props.sourcePath)?.peerPath ?? ''
}

function mappingBlocker(peerSanId: string): string | undefined {
  if (mappingForPeer(peerSanId)) return undefined
  const peer = props.inventory.find(n => n.sanId === peerSanId)
  if (!peer?.sshReady) return t('lvm.cluster.wizard.peer_ssh_down')
  return t('lvm.cluster.wizard.mapping_required')
}

function peerCandidateOptions(peer: ClusterLvmNodeInventory) {
  const opts = peer.overview.candidates
    .filter(c => c.eligible)
    .map(c => ({ value: c.path, label: c.path }))
  const current = mappingForPeer(peer.sanId)
  if (current && !opts.some(o => o.value === current)) {
    opts.unshift({ value: current, label: current })
  }
  return opts
}

function setMapping(peerSanId: string, peerPath: string) {
  const rest = props.mappings.filter(m => !(m.peerSanId === peerSanId && m.sourcePath === props.sourcePath))
  if (peerPath) {
    rest.push({
      sourceSanId: props.sourceSanId,
      peerSanId,
      sourcePath: props.sourcePath,
      peerPath,
      stableKey: props.sourcePath,
    })
  }
  emit('update:mappings', rest)
}
</script>
