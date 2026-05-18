<template>
  <div class="esos-card">
    <!-- En-tête nœud -->
    <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
      <span class="status-dot" :class="node.sshReady ? 'status-dot--online' : 'status-dot--offline'" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-gray-800">{{ node.hostname }}</p>
        <p class="text-xs text-gray-400 font-identifier">{{ node.host }}</p>
        <!-- Compteurs ressources / ALUA (compact) -->
        <div v-if="node.sshReady" class="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
          <span>
            <span class="font-semibold" :class="node.resources.length > 0 ? 'text-gray-600' : 'text-gray-300'">{{ node.resources.length }}</span>
            ressource{{ node.resources.length !== 1 ? 's' : '' }}
          </span>
          <span class="text-gray-200">·</span>
          <span>
            <span class="font-semibold" :class="node.aluaGroups.length > 0 ? 'text-gray-600' : 'text-gray-300'">{{ node.aluaGroups.length }}</span>
            groupe{{ node.aluaGroups.length !== 1 ? 's' : '' }} ALUA
          </span>
        </div>
      </div>
      <UBadge :color="node.role === 'primary' ? 'blue' : 'gray'" size="xs">
        {{ node.role === 'primary' ? 'Primaire' : 'Secondaire' }}
      </UBadge>
    </div>

    <div class="px-4 py-3 space-y-3">

      <!-- Services Corosync / Pacemaker -->
      <div class="grid grid-cols-2 gap-2">
        <ClusterServiceStatusRow
          label="Corosync"
          :enabled="node.corosyncEnabled"
          :running="node.corosyncRunning"
          :node-id="node.nodeId"
          service="corosync"
          @toggled="emit('refresh')"
        />
        <ClusterServiceStatusRow
          label="Pacemaker"
          :enabled="node.pacemakerEnabled"
          :running="node.pacemakerRunning"
          :node-id="node.nodeId"
          service="pacemaker"
          @toggled="emit('refresh')"
        />
      </div>

      <!-- État Pacemaker + Quorum -->
      <div class="flex items-center gap-3 text-xs">
        <span class="text-gray-400">État nœud :</span>
        <UBadge :color="pmStateColor[node.pacemakerNodeState]" size="xs">
          {{ node.pacemakerNodeState }}
        </UBadge>
        <span v-if="node.quorate !== undefined" class="flex items-center gap-1">
          <span class="text-gray-400">Quorum :</span>
          <span :class="node.quorate ? 'text-green-600' : 'text-red-500'" class="font-medium">
            {{ node.quorate ? 'OK' : 'NON' }}
          </span>
        </span>
      </div>

      <!-- SSH hors ligne -->
      <div v-if="!node.sshReady" class="text-xs text-red-500 flex items-center gap-1">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5" />
        SSH non disponible — données indisponibles
      </div>

      <!-- Ressources cluster : visible uniquement si > 0 -->
      <div v-if="node.sshReady && node.resources.length > 0">
        <p class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Ressources Pacemaker</p>
        <div class="space-y-1">
          <div
            v-for="res in node.resources"
            :key="res.id"
            class="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0"
          >
            <div>
              <span class="font-identifier text-gray-700">{{ res.id }}</span>
              <span class="text-gray-400 ml-2">{{ res.type }}</span>
            </div>
            <ResourceRoleBadge :role="res.state" />
          </div>
        </div>
      </div>

      <!-- Groupes ALUA : visible uniquement si > 0 -->
      <div v-if="node.sshReady && node.aluaGroups.length > 0">
        <p class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Groupes ALUA</p>
        <div class="space-y-1">
          <div
            v-for="grp in node.aluaGroups"
            :key="`${grp.deviceGroup}-${grp.targetGroup}`"
            class="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0"
          >
            <div>
              <span class="font-identifier text-gray-700">{{ grp.deviceGroup }}</span>
              <span class="text-gray-400 mx-1">/</span>
              <span class="font-identifier text-gray-600">{{ grp.targetGroup }}</span>
              <span class="text-gray-300 ml-1">(ID {{ grp.groupId }})</span>
            </div>
            <ALUAStateBadge :state="grp.state" />
          </div>
        </div>
      </div>

      <!-- DRBD -->
      <div v-if="node.sshReady">
        <div v-if="node.drbd.available || node.drbd.enabled">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">DRBD</p>
            <span class="text-[10px] text-gray-400 font-mono">v{{ node.drbd.version }}</span>
          </div>

          <!-- Ligne service (start/stop + enable/disable) -->
          <ClusterServiceStatusRow
            label="DRBD"
            :enabled="node.drbd.enabled"
            :running="node.drbd.running"
            :node-id="node.nodeId"
            service="drbd"
            :allow-toggle-enabled="true"
            enabled-label="Mode standalone (rc.drbd_enable)"
            @toggled="emit('refresh')"
          />

          <!-- Avertissement Pacemaker -->
          <div v-if="!node.drbd.enabled && node.drbd.available" class="mt-1.5 flex items-start gap-1.5 text-[10px] text-amber-600">
            <UIcon name="i-heroicons-information-circle" class="w-3 h-3 shrink-0 mt-px" />
            <span>rc.drbd_enable=NO — géré par Pacemaker. Activer uniquement en mode standalone.</span>
          </div>

          <!-- Ressources DRBD -->
          <div v-if="node.drbd.resources.length > 0" class="mt-2">
            <DRBDResourceRow
              v-for="res in node.drbd.resources"
              :key="res.name"
              :res="res"
            />
          </div>
          <p v-else class="mt-2 text-xs text-gray-400 italic">Aucune ressource DRBD configurée</p>
        </div>
        <p v-else class="text-xs text-gray-300 italic">DRBD non disponible sur ce nœud</p>
      </div>

    </div>

    <!-- Pied de carte -->
    <div class="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
      Vérifié {{ formatAgo(node.lastChecked) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClusterNodeStatus, PacemakerNodeState } from '~/server/utils/types'

defineProps<{ node: ClusterNodeStatus }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

const pmStateColor: Record<PacemakerNodeState, string> = {
  Online:  'green',
  Offline: 'red',
  Standby: 'amber',
  Unknown: 'gray',
}

function formatAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `il y a ${s}s`
  return `il y a ${Math.floor(s / 60)}min`
}
</script>
