<template>
  <div v-if="mode === 'active-active'" class="esos-card px-5 py-3 border-amber-200 bg-amber-50">
    <p class="text-sm font-semibold text-amber-800 flex items-center gap-2">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
      Mode Active/Active — points d'attention
    </p>
    <ul class="text-xs text-amber-700 mt-2 space-y-1 list-disc list-inside">
      <li>SCST n'est pas cluster-aware : les opérations SCSI (locks) ne sont pas partagées entre nœuds.</li>
      <li>Ne pas utiliser un algorithme MPIO round-robin sur les initiateurs.</li>
      <li>Utiliser Fixed Pathing Policy ou équivalent sur chaque initiateur.</li>
    </ul>
  </div>

  <div v-else-if="mode === 'active-passive'" class="esos-card px-5 py-3 border-blue-200 bg-blue-50">
    <p class="text-sm font-semibold text-blue-800 flex items-center gap-2">
      <UIcon name="i-heroicons-information-circle" class="w-4 h-4" />
      Mode Active/Passive
    </p>
    <p class="text-xs text-blue-700 mt-1">
      Un seul nœud expose les LUNs à la fois. Le basculement est géré automatiquement par Pacemaker.
    </p>
  </div>

  <div v-else-if="mode === 'unconfigured'" class="esos-card px-5 py-3 border-gray-200 bg-gray-50">
    <p class="text-sm font-semibold text-gray-600 flex items-center gap-2">
      <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" />
      Cluster non configuré
    </p>
    <p class="text-xs text-gray-500 mt-1">
      Activez le mode cluster dans la section Administration pour configurer les nœuds.
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ mode: string }>()
</script>
