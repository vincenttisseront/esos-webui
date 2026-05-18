<template>
  <span
    class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
    :class="cfg.cls"
  >
    <span class="w-1.5 h-1.5 rounded-full" :class="cfg.dot" />
    {{ cfg.label }}
  </span>
</template>

<script setup lang="ts">
import type { ALUAState } from '~/server/utils/types'

const props = defineProps<{ state: ALUAState }>()

const CONFIG: Record<ALUAState, { label: string; cls: string; dot: string }> = {
  active:       { label: 'Active',        cls: 'bg-green-100 text-green-700',  dot: 'bg-green-500'  },
  nonoptimized: { label: 'Non-optimized', cls: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-400'   },
  standby:      { label: 'Standby',       cls: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400'   },
  unavailable:  { label: 'Unavailable',   cls: 'bg-red-100 text-red-600',     dot: 'bg-red-500'    },
  unknown:      { label: 'Inconnu',       cls: 'bg-amber-100 text-amber-600', dot: 'bg-amber-400'  },
}

const cfg = computed(() => CONFIG[props.state] ?? CONFIG.unknown)
</script>
