<template>
  <div class="py-2 border-b border-gray-50 last:border-0 space-y-2">

    <!-- Ligne 1 : nom + rôle + taille -->
    <div class="flex items-center justify-between gap-2">
      <span class="font-identifier text-sm text-gray-800 dark:text-gray-200">{{ res.name }}</span>
      <div class="flex items-center gap-1.5">
        <DRBDRoleBadge :role="res.role" />
        <span v-if="res.sizeBytes > 0" class="text-xs text-gray-400">{{ formatSize(res.sizeBytes) }}</span>
      </div>
    </div>

    <!-- Ligne 2 : disques local / peer -->
    <div class="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
      <div class="flex items-center gap-1">
        <span class="text-gray-400">Local :</span>
        <DRBDDiskStateBadge :state="res.diskState" />
      </div>
      <div class="flex items-center gap-1">
        <span class="text-gray-400">Peer{{ res.peerNode ? ` (${res.peerNode})` : '' }} :</span>
        <DRBDDiskStateBadge :state="res.peerDiskState" />
      </div>
    </div>

    <!-- Ligne 3 : connexion + rôle peer -->
    <div class="flex items-center gap-2 text-xs">
      <span class="text-gray-400">Connexion :</span>
      <DRBDConnBadge :state="res.connState" />
      <span v-if="res.peerRole !== 'Unknown'" class="flex items-center gap-1 text-gray-400">
        · peer <DRBDRoleBadge :role="res.peerRole" />
      </span>
    </div>

    <!-- Barre de resync (visible uniquement si syncing) -->
    <div v-if="res.isSyncing" class="space-y-1">
      <div class="flex items-center justify-between text-xs text-blue-600">
        <span>Resync {{ res.syncPercent.toFixed(1) }}%</span>
        <span v-if="res.outOfSyncKB > 0">{{ formatKB(res.outOfSyncKB) }} restant</span>
        <span v-if="res.etaSeconds !== null && res.etaSeconds > 0">ETA {{ formatEta(res.etaSeconds) }}</span>
      </div>
      <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
        <div
          class="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
          :style="{ width: `${res.syncPercent}%` }"
        />
      </div>
    </div>

    <!-- Alerte Split-Brain (StandAlone) -->
    <div v-if="res.connState === 'StandAlone'" class="rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-1.5 text-xs text-red-700 dark:text-red-300 space-y-1">
      <div class="font-semibold flex items-center gap-1">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5" />
        Split-brain détecté — intervention requise
      </div>
      <div class="text-red-600 font-mono">
        drbdadm connect --discard-my-data {{ res.name }}
      </div>
    </div>

    <!-- Alerte Disconnected / Unconnected -->
    <div v-else-if="res.connState === 'Disconnected' || res.connState === 'Unconnected'" class="rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-1.5 text-xs text-amber-700 flex items-center gap-1">
      <UIcon name="i-heroicons-signal-slash" class="w-3.5 h-3.5" />
      Pair hors ligne — réplication inactive
    </div>

  </div>
</template>

<script setup lang="ts">
import type { DRBDResource } from '~/server/utils/parsers/drbd.parser'

defineProps<{ res: DRBDResource }>()

function formatSize(bytes: number): string {
  if (bytes === 0) return ''
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(0)} MB`
}

function formatKB(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`
  if (kb >= 1024)        return `${(kb / 1024).toFixed(0)} MB`
  return `${kb} KB`
}

function formatEta(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}
</script>
