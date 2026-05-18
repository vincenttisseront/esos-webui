<template>
  <div class="space-y-1">
    <div class="flex gap-1">
      <div
        v-for="i in 4"
        :key="i"
        class="h-1.5 flex-1 rounded-full transition-colors duration-300"
        :class="i <= score ? scoreColor : 'bg-gray-200'"
      />
    </div>
    <p v-if="label" class="text-xs" :class="labelColor">{{ label }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ password: string }>()

const score = computed(() => {
  const p = props.password
  if (!p) return 0
  let s = 0
  if (p.length >= 8)  s++
  if (p.length >= 12) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p) && /[^a-zA-Z0-9]/.test(p)) s++
  return s
})

const scoreColor = computed(() => {
  if (score.value <= 1) return 'bg-red-500'
  if (score.value === 2) return 'bg-orange-400'
  if (score.value === 3) return 'bg-yellow-400'
  return 'bg-green-500'
})

const labelColor = computed(() => {
  if (score.value <= 1) return 'text-red-600'
  if (score.value === 2) return 'text-orange-600'
  if (score.value === 3) return 'text-yellow-600'
  return 'text-green-600'
})

const label = computed(() => {
  if (!props.password) return ''
  const labels = ['Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort']
  return labels[score.value] ?? ''
})
</script>
