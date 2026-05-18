<template>
  <span
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
    :class="classes"
  >
    <UIcon :name="icon" class="w-3 h-3 shrink-0" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import type { UserRole } from '../../utils/types'

const props = defineProps<{ role: UserRole }>()

const config: Record<UserRole, { label: string; icon: string; classes: string }> = {
  admin:    { label: 'Admin',    icon: 'i-heroicons-shield-check',  classes: 'bg-purple-100 text-purple-700' },
  operator: { label: 'Opérateur', icon: 'i-heroicons-wrench-screwdriver', classes: 'bg-blue-100 text-blue-700' },
  viewer:   { label: 'Lecteur',  icon: 'i-heroicons-eye',           classes: 'bg-gray-100 text-gray-600' },
}

const { label, icon, classes } = computed(() => config[props.role] ?? config.viewer).value
</script>
