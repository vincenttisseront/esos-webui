<template>
  <div class="space-y-8">
    <UAlert
      v-if="error"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="t('dashboard.index.loadErrorTitle')"
      :description="error"
    />

    <!-- Bannière cluster HA (visible quand un cluster est sélectionné) -->
    <ClusterDashboardBanner v-if="selectedCluster" :cluster="selectedCluster" />

    <StatsRow :stats="overview?.stats" />

    <!-- Débit I/O temps réel -->
    <ThroughputBar />

    <!-- État FC + Volume en ligne -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <FCPortCard :ports="hw.data?.fcPorts ?? []" />
      <VolumeCard :volumes="hw.data?.volumes ?? []" />
    </div>

    <section v-for="group in targetGroups" :key="group.driver">
      <SectionTitle :title="group.label" :count="group.targets.length" />
      <TargetTable :targets="group.targets" :loading="pending" compact />
    </section>

    <section>
      <SectionTitle
        :title="t('dashboard.index.sections.sessions')"
        :count="overview?.sessions?.length ?? 0"
        live
      />
      <SessionTable :sessions="overview?.sessions ?? []" :loading="pending" />
    </section>

    <section>
      <SectionTitle :title="t('dashboard.index.sections.devices')" :count="overview?.devices?.length ?? 0" />
      <DeviceTable
        :devices="overview?.devices ?? []"
        :loading="pending"
        :usage="lunUsage"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()
const { overview, pending, error, store: overviewStore } = useOverview()
const { selectedCluster, selectedId } = useSelectedSan()
const hw = useHardwareStore()
const statsStore = useStatsStore()

onMounted(() => {
  hw.fetch()
})

// Re-fetch immediately when the selected SAN/cluster changes
// Clear stale data first so the previous node's stats never linger
watch(selectedId, () => {
  overviewStore.reset()
  hw.reset()
  statsStore.reset()
  overviewStore.fetch()
  hw.fetch()
  statsStore.fetchAll()
})

function driverLabel(driver: string): string {
  if (driver === 'qla2x00t') return t('dashboard.index.targets.fc')
  if (driver === 'iscsi') return t('dashboard.index.targets.iscsi')
  return t('dashboard.index.targets.driverFallback', { driver })
}

const targetGroups = computed(() => {
  const map = new Map<string, { driver: string; label: string; targets: typeof overview.value.targets }>()
  for (const target of (overview.value?.targets ?? [])) {
    if (!map.has(target.driver)) {
      map.set(target.driver, { driver: target.driver, label: driverLabel(target.driver), targets: [] })
    }
    map.get(target.driver)!.targets.push(target)
  }
  return [...map.values()]
})

function lunUsage(deviceName: string): string {
  const allLuns = (overview.value?.targets ?? [])
    .flatMap((tg) => tg.groups)
    .flatMap((g) => g.luns)
    .filter((l) => l.device === deviceName)
  if (allLuns.length === 0) return '—'
  const ro = allLuns.filter((l) => l.readOnly).length
  const base = t('storage.devices.usage.count', { count: allLuns.length }) as string
  return ro > 0 ? base + (t('storage.devices.usage.withRoSuffix', { ro }) as string) : base
}
</script>
