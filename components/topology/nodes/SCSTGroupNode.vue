<template>
  <div class="topology-node node-group">
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
    <div class="node-content">
      <p class="node-label text-purple-700">{{ t('topology.nodes.scstGroup.label') }}</p>
      <p class="font-identifier text-xs font-semibold text-gray-800 dark:text-gray-200">{{ data.group.name }}</p>
      <p class="text-xs text-gray-400 mt-1">
        {{ t('topology.nodes.scstGroup.summary', { initiators: data.group.initiators.length, luns: data.group.luns.length }) }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

const { t } = useEsosI18n()

defineProps<{ data: { group: any; target: string } }>()
</script>
