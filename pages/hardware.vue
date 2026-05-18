<template>
  <div class="space-y-6">
    <!-- SSH non disponible -->
    <UAlert
      v-if="!sshReady"
      color="orange"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="t('hardware.page.sshUnavailableTitle')"
      :description="t('hardware.page.sshUnavailableDesc')"
    />

    <!-- Alertes actives -->
    <AlertsPanel v-if="hw.alerts.length > 0" :alerts="hw.alerts" />

    <!-- Loading initial -->
    <div v-if="hw.loading && !hw.data" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl text-gray-400" />
    </div>

    <template v-else-if="hw.data">
      <!-- Ligne 1 : CPU/RAM + Ports FC -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SystemGauges :info="hw.data.system" :memory="hw.data.memory" />
        <FCPortCard :ports="hw.data.fcPorts" />
      </div>

      <!-- Ligne 2 : Volumes -->
      <VolumeCard :volumes="hw.data.volumes" />

      <!-- Ligne 3 : Disques -->
      <UCard>
        <template #header>
          <span class="text-lg font-semibold">{{ t('hardware.page.storageTitle') }}</span>
        </template>
        <DiskTree :disks="hw.data.disks" />
      </UCard>
    </template>

    <!-- Dernière mise à jour -->
    <p v-if="hw.data" class="text-xs text-right text-gray-400">
      {{ lastRefreshLabel }}
    </p>
  </div>
</template>

<script setup lang="ts">
const { t, locale } = useEsosI18n()
const hw = useHardwareStore()

// SSH readiness — exposé via un composable léger
const sshReady = ref(true)

const lastRefreshLabel = computed(() => {
  if (!hw.data) return ''
  const time = new Date(hw.data.capturedAt).toLocaleTimeString(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return t('hardware.page.updated', { time }) as string
})

onMounted(() => {
  hw.startPolling(15_000)
})

onUnmounted(() => {
  hw.stopPolling()
})
</script>
