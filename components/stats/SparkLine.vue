<script setup lang="ts">
import type { ThroughputPoint } from '~/server/utils/types'

/**
 * Mini-graphe SVG inline pour l'historique 2min (cf. SDD v2.2 §7.2).
 * Ligne bleue = lecture, orange = écriture.
 */

const props = defineProps<{
  data: ThroughputPoint[]
  width: number
  height: number
}>()

function toPoints(values: number[]): string {
  if (values.length < 2) return ''
  const max = Math.max(...values, 1)
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * props.width
      const y = props.height - (v / max) * props.height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

const readPoints = computed(() => toPoints(props.data.map((d) => d.readKbps)))
const writePoints = computed(() =>
  toPoints(props.data.map((d) => d.writeKbps)),
)
</script>

<template>
  <svg :width="width" :height="height" class="overflow-visible">
    <!-- Read line (bleu) -->
    <polyline
      v-if="readPoints.length > 1"
      :points="readPoints"
      fill="none"
      stroke="#3b82f6"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <!-- Write line (orange) -->
    <polyline
      v-if="writePoints.length > 1"
      :points="writePoints"
      fill="none"
      stroke="#f97316"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <!-- Baseline -->
    <line
      :x1="0"
      :y1="height"
      :x2="width"
      :y2="height"
      stroke="#e5e7eb"
      stroke-width="0.5"
    />
  </svg>
</template>
