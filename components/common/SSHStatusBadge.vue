<template>
  <div class="flex items-center gap-1.5 text-xs">
    <span class="w-2 h-2 rounded-full shrink-0" :class="dotClass" />
    <span :class="textClass">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import type { SSHStatus } from '~/server/utils/ssh-session-manager'

const props = defineProps<{ status: SSHStatus }>()

const dotClass = computed(() => ({
  connected:    'bg-green-500',
  reconnecting: 'bg-amber-400 animate-pulse',
  connecting:   'bg-amber-400 animate-pulse',
  error:        'bg-red-500',
}[props.status] ?? 'bg-gray-400'))

const textClass = computed(() => ({
  connected:    'text-green-600',
  reconnecting: 'text-amber-500',
  connecting:   'text-amber-500',
  error:        'text-red-600 font-medium',
}[props.status] ?? 'text-gray-400'))

const label = computed(() => ({
  connected:    'SSH connecté',
  reconnecting: 'SSH reconnexion…',
  connecting:   'SSH connexion…',
  error:        'SSH hors ligne',
}[props.status] ?? 'SSH inconnu'))
</script>
