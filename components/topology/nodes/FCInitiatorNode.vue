<template>
  <div
    class="topology-node node-initiator"
    :class="data.active ? 'node-initiator--active' : 'node-initiator--inactive'"
  >
    <Handle type="source" :position="Position.Right" />
    <div class="flex items-center gap-2">
      <span
        class="w-2 h-2 rounded-full shrink-0"
        :class="data.active ? 'bg-green-500' : 'bg-gray-300'"
      />
      <div>
        <p class="node-label">{{ t('topology.nodes.fcInitiator.label') }}</p>
        <p class="node-wwn">{{ data.wwn }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

const { t } = useEsosI18n()

defineProps<{ data: { wwn: string; active: boolean } }>()
</script>
