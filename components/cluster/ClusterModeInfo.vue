<template>
  <details v-if="mode === 'active-active'" class="esos-card px-5 py-3 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
    <summary class="text-sm font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2 cursor-pointer select-none list-none">
      <UIcon name="i-heroicons-information-circle" class="w-4 h-4" />
      Mode Active/Active — bonnes pratiques
    </summary>
    <ul class="text-xs text-blue-700 dark:text-blue-300 mt-2 space-y-1 list-disc list-inside">
      <li>SCST n'est pas cluster-aware : les opérations SCSI (locks) ne sont pas partagées entre nœuds.</li>
      <li>Ne pas utiliser un algorithme MPIO round-robin sur les initiateurs.</li>
      <li>Utiliser Fixed Pathing Policy ou équivalent sur chaque initiateur.</li>
    </ul>
  </details>

  <div v-else-if="mode === 'active-passive'" class="esos-card px-5 py-3 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
    <p class="text-sm font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2">
      <UIcon name="i-heroicons-information-circle" class="w-4 h-4" />
      Mode Active/Passive
    </p>
    <p class="text-xs text-blue-700 dark:text-blue-300 mt-1">
      Un seul nœud expose les LUNs à la fois. Le basculement est géré automatiquement par Pacemaker.
    </p>
  </div>

  <div v-else-if="mode === 'unconfigured'" class="esos-card px-5 py-3 border-gray-200 bg-gray-50 dark:bg-gray-900 dark:border-gray-700">
    <p class="text-sm font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-2">
      <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" />
      Cluster non configuré
    </p>
    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
      Activez le mode cluster dans la section Administration pour configurer les nœuds.
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ mode: string }>()
</script>
