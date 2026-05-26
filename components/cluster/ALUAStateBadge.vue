<template>
  <span
    class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
    :class="cfg.cls"
  >
    <span class="w-1.5 h-1.5 rounded-full" :class="cfg.dot" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import type { ALUAState } from '~/types/alua'

const props = defineProps<{ state: ALUAState }>()

const { t } = useEsosI18n()

const STYLE: Record<ALUAState, { cls: string; dot: string }> = {
  active:       { cls: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',  dot: 'bg-green-500'  },
  nonoptimized: { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',   dot: 'bg-blue-400'   },
  standby:      { cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',   dot: 'bg-gray-400'   },
  unavailable:  { cls: 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300',     dot: 'bg-red-500'    },
  unknown:      { cls: 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300', dot: 'bg-amber-400'  },
}

const cfg = computed(() => STYLE[props.state] ?? STYLE.unknown)
const label = computed(() => t(`cluster.alua.state.${props.state}`))
</script>
