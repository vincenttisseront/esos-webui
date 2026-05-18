<template>
  <div class="topology-node node-hba" :class="{ online: port.portState === 'Online' }">
    <Handle type="source" :position="Position.Right" />
    <div class="node-icon">⬡</div>
    <div class="node-content">
      <p class="text-[10px] uppercase tracking-wide text-gray-500">{{ t('topology.nodes.hbaPort.label') }}</p>
      <p class="node-label">{{ port.host.toUpperCase() }}</p>
      <p class="node-wwn">{{ shortWwn(port.portName) }}</p>
      <div class="node-badge" :class="port.portState === 'Online' ? 'badge-green' : 'badge-red'">
        {{ port.portState }} · {{ port.speed }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { FCPort } from '~/server/utils/types'

const { t } = useEsosI18n()

const props = defineProps<{ data: { port: FCPort } }>()
const port  = computed(() => props.data.port)

function shortWwn(wwn: string): string {
  return wwn.split(':').slice(-4).join(':')
}
</script>
