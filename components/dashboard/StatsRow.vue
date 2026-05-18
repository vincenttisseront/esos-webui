<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
    <StatCard
      icon="🎯"
      :label="t('dashboard.statsRow.targets')"
      :value="stats?.targets"
      :loading="!stats"
      bg-color="bg-blue-50 dark:bg-blue-900/30"
    />
    <StatCard
      icon="💾"
      :label="t('dashboard.statsRow.devices')"
      :value="stats?.devices"
      :loading="!stats"
      bg-color="bg-purple-50 dark:bg-purple-900/30"
    />
    <StatCard
      icon="🔗"
      :label="t('dashboard.statsRow.sessions')"
      :value="stats?.sessions"
      :loading="!stats"
      bg-color="bg-green-50 dark:bg-green-900/30"
    />
    <StatCard
      icon="👥"
      :label="t('dashboard.statsRow.groups')"
      :value="stats?.groups"
      :loading="!stats"
      bg-color="bg-yellow-50 dark:bg-yellow-900/30"
    />
    <StatCard
      icon="📦"
      :label="t('dashboard.statsRow.luns')"
      :value="stats?.luns"
      :loading="!stats"
      bg-color="bg-red-50 dark:bg-red-900/30"
    />
  </div>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()

defineProps<{
  stats?: {
    targets: number
    devices: number
    sessions: number
    groups: number
    luns: number
  } | null
}>()
</script>
