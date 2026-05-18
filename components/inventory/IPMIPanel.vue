<template>
  <div>
    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">IPMI / Capteurs</h3>

    <div v-if="!ipmi.available" class="text-sm text-gray-400 italic">
      IPMI non disponible sur ce système
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Temperatures -->
      <div>
        <p class="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1">
          <UIcon name="i-heroicons-fire" class="w-3.5 h-3.5 text-orange-400" /> Températures
        </p>
        <SensorList :sensors="ipmi.temperatures" />
      </div>

      <!-- Fans -->
      <div>
        <p class="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1">
          <UIcon name="i-heroicons-cog" class="w-3.5 h-3.5 text-blue-400" /> Ventilateurs
        </p>
        <SensorList :sensors="ipmi.fans" />
      </div>

      <!-- PSUs -->
      <div>
        <p class="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1">
          <UIcon name="i-heroicons-bolt" class="w-3.5 h-3.5 text-yellow-400" /> Alimentations
        </p>
        <SensorList :sensors="ipmi.powerSupplies" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IPMIInfo } from '~/server/utils/types'

defineProps<{ ipmi: IPMIInfo }>()
</script>
