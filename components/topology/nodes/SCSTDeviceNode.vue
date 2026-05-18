<template>
  <div class="topology-node node-device">
    <Handle type="target" :position="Position.Left" />
    <div class="node-content">
      <p class="node-label text-teal-700">{{ t('topology.nodes.scstDevice.label') }}</p>
      <p class="font-identifier text-xs font-semibold text-gray-800">{{ data.device.name }}</p>
      <p class="text-xs text-gray-400 font-identifier truncate mt-1">{{ data.device.filename }}</p>
      <span class="node-badge badge-gray mt-1">{{ data.device.handler }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

const { t } = useEsosI18n()

defineProps<{ data: { device: any } }>()
</script>
