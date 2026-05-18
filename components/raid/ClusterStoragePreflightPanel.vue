<template>
  <div class="space-y-3">
    <UAlert
      :title="preflight.ok ? 'Préflight stockage cluster validé' : 'Préflight stockage cluster bloquant'"
      :description="preflight.ok ? 'Les nœuds du cluster ont été comparés avec succès. L’exécution destructive utilisera le flux multi-nœud et les mappings validés.' : 'Le stockage cluster n’est pas prêt pour cette opération. Corrigez les blocages avant de continuer.'"
      :color="preflight.ok ? 'green' : 'red'"
      :icon="preflight.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
    />
    <UAlert
      title="Changement stockage cluster-aware"
      description="Sync config ne crée pas les partitions, superblocks MD, métadonnées LVM ni block devices sur les nœuds pairs. Cette opération écrit directement sur chaque nœud avec le mapping validé."
      color="amber"
      icon="i-heroicons-exclamation-triangle"
    />

    <div v-if="preflight.syncLimitations.length" class="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      <p class="font-semibold mb-1">Limites de Sync config</p>
      <ul class="list-disc pl-4 space-y-0.5">
        <li v-for="item in preflight.syncLimitations" :key="item">{{ item }}</li>
      </ul>
    </div>

    <div v-if="preflight.blockers.length" class="space-y-1">
      <p class="text-xs font-semibold text-red-600 uppercase tracking-wide">Blocages cluster</p>
      <div
        v-for="blocker in preflight.blockers"
        :key="blocker"
        class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ blocker }}
      </div>
    </div>

    <div v-if="preflight.warnings.length" class="space-y-1">
      <p class="text-xs font-semibold text-amber-600 uppercase tracking-wide">Avertissements cluster</p>
      <div
        v-for="warning in preflight.warnings"
        :key="warning"
        class="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
      >
        {{ warning }}
      </div>
    </div>

    <div class="overflow-x-auto rounded border border-gray-200">
      <table class="w-full text-xs">
        <thead class="bg-gray-50 text-left text-gray-500 uppercase tracking-wide">
          <tr>
            <th class="px-3 py-2">Nœud</th>
            <th class="px-3 py-2">Rôle</th>
            <th class="px-3 py-2">SSH</th>
            <th class="px-3 py-2">Outils</th>
            <th class="px-3 py-2">Block devices</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="node in preflight.nodes" :key="node.sanId" class="border-t border-gray-100">
            <td class="px-3 py-2 font-medium text-gray-800">{{ node.label }}</td>
            <td class="px-3 py-2 text-gray-600">{{ node.role ?? '—' }}</td>
            <td class="px-3 py-2" :class="node.sshReady ? 'text-green-600' : 'text-red-600'">
              {{ node.sshReady ? 'connecté' : 'indisponible' }}
            </td>
            <td class="px-3 py-2 text-gray-600">
              <span v-if="node.tools">mdadm {{ node.tools.mdadm ? 'OK' : 'KO' }}, parted {{ node.tools.parted ? 'OK' : 'KO' }}, sfdisk {{ node.tools.sfdisk ? 'OK' : 'KO' }}</span>
              <span v-else>—</span>
            </td>
            <td class="px-3 py-2 text-gray-600">{{ node.blockDevices.length }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="preflight.mappings.length" class="overflow-x-auto rounded border border-gray-200">
      <table class="w-full text-xs">
        <thead class="bg-gray-50 text-left text-gray-500 uppercase tracking-wide">
          <tr>
            <th class="px-3 py-2">Source</th>
            <th class="px-3 py-2">Nœud cible</th>
            <th class="px-3 py-2">Cible</th>
            <th class="px-3 py-2">Confiance</th>
            <th class="px-3 py-2">Évidence</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="mapping in preflight.mappings" :key="`${mapping.targetSanId}-${mapping.sourcePath}`" class="border-t border-gray-100">
            <td class="px-3 py-2 font-mono">{{ mapping.sourcePath }}</td>
            <td class="px-3 py-2">{{ nodeLabel(mapping.targetSanId) }}</td>
            <td class="px-3 py-2 font-mono">{{ mapping.targetPath ?? '—' }}</td>
            <td class="px-3 py-2">
              <UBadge :color="confidenceColor(mapping.confidence)" :label="mapping.confidence" size="xs" variant="soft" />
            </td>
            <td class="px-3 py-2 text-gray-600">
              {{ mapping.evidence.join(', ') || mapping.blockers.join(', ') || mapping.warnings.join(', ') || '—' }}
              <span v-if="mapping.candidates?.length" class="block text-amber-600">
                Mapping manuel requis : {{ mapping.candidates.length }} candidat(s)
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClusterStoragePreflightResult, ClusterDiskMappingConfidence } from '~/types/raid'

const props = defineProps<{ preflight: ClusterStoragePreflightResult }>()

function nodeLabel(sanId: string): string {
  return props.preflight.nodes.find(n => n.sanId === sanId)?.label ?? sanId
}

function confidenceColor(confidence: ClusterDiskMappingConfidence): 'green' | 'yellow' | 'red' | 'gray' {
  if (confidence === 'high') return 'green'
  if (confidence === 'medium') return 'yellow'
  if (confidence === 'low') return 'yellow'
  return 'red'
}
</script>
