<template>
  <div class="topology-node node-target">
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
    <div class="node-content">
      <p class="node-label text-blue-700">{{ t('topology.nodes.fcTarget.label') }}</p>
      <p class="node-wwn">{{ data.target.name }}</p>
      <div class="flex gap-2 mt-1">
        <span class="node-badge" :class="data.target.enabled ? 'badge-green' : 'badge-red'">
          {{ data.target.enabled ? t('topology.nodes.fcTarget.enabled') : t('topology.nodes.fcTarget.disabled') }}
        </span>
        <span v-if="data.sessionCount > 0" class="node-badge badge-blue">
          {{ t('topology.nodes.fcTarget.sessions', { count: data.sessionCount }) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

const { t } = useEsosI18n()

defineProps<{ data: { target: any; sessionCount: number } }>()
</script>
