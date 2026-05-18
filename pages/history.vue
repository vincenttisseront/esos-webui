<template>
  <div class="space-y-6">
    <!-- En-tête -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold">Historique des métriques</h1>
        <p v-if="oldestDate" class="text-xs text-gray-500 mt-0.5">
          Données disponibles depuis {{ oldestDate }}
        </p>
        <p v-else class="text-xs text-gray-500 mt-0.5 italic">
          Collecte démarrée — premier point dans moins de 30s
        </p>
      </div>
    </div>

    <!-- Sessions I/O -->
    <IOTimeSeriesChart title="Sessions I/O — Initiateurs" />

    <!-- Devices I/O -->
    <IOTimeSeriesChart title="Devices I/O" />

    <!-- CPU & RAM -->
    <SystemTimeSeriesChart />
  </div>
</template>

<script setup lang="ts">
// Récupère le point le plus ancien via l'API pour l'afficher dans l'en-tête
const { data: sessionHistory } = await useFetch<{
  from: number
  series: unknown[]
}>('/api/history/sessions?window=24h&metric=read_kbps')

const oldestDate = computed(() => {
  if (!sessionHistory.value?.from) return null
  return new Date(sessionHistory.value.from).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
})
</script>
