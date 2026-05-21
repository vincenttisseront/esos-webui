<template>
  <AdminSection title="Collecte de Métriques" icon="i-heroicons-chart-bar">
    <div class="space-y-5">

      <!-- Activer/Désactiver -->
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Collecte automatique</p>
          <p class="text-xs text-gray-400">Active la remontée périodique des métriques I/O et système</p>
        </div>
        <UToggle v-model="form.enabled" @change="autoSave" />
      </div>

      <!-- Intervalle -->
      <UFormGroup
        :label="`Intervalle de collecte — ${form.intervalSec}s`"
        :description="`${pointsPerHour} points / heure · ${pointsPerDay} points / jour`"
      >
        <input
          type="range"
          v-model.number="form.intervalSec"
          :min="10" :max="300" :step="10"
          class="w-full accent-blue-500"
          @change="autoSave"
        />
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>10s (précis)</span>
          <span>300s (léger)</span>
        </div>
      </UFormGroup>

      <!-- Rétention -->
      <UFormGroup
        :label="`Rétention — ${retentionLabel}`"
        :description="`Estimation : ${estimatedSamples.toLocaleString('fr-FR')} samples stockés`"
      >
        <input
          type="range"
          v-model.number="form.retentionHours"
          :min="1" :max="168" :step="1"
          class="w-full accent-purple-500"
          @change="autoSave"
        />
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>1h</span>
          <span>7 jours</span>
        </div>
      </UFormGroup>

    </div>
  </AdminSection>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'

const admin = useAdminStore()
const form  = reactive({ ...admin.collector })

// Estimation du nombre de samples
const METRICS_PER_COLLECT = 33 // ≈ 33 lignes par collecte (v2.4)
const pointsPerHour  = computed(() => Math.round(3600 / form.intervalSec))
const pointsPerDay   = computed(() => pointsPerHour.value * 24)
const estimatedSamples = computed(() =>
  Math.round((form.retentionHours * 3600 / form.intervalSec) * METRICS_PER_COLLECT),
)

const retentionLabel = computed(() => {
  const h = form.retentionHours
  if (h < 24)   return `${h}h`
  if (h === 24) return '24h'
  return `${Math.floor(h / 24)}j${h % 24 > 0 ? ' ' + (h % 24) + 'h' : ''}`
})

const debouncedSave = useDebounceFn(() => admin.saveCollector(form as any), 800)
async function autoSave() { debouncedSave() }
</script>
