<template>
  <div class="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Comparaison GitHub</p>

    <!-- Build master -->
    <div v-if="diff === 'on-master'" class="rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm space-y-2">
      <p class="text-purple-800 font-medium">Build de développement (master)</p>
      <p class="text-purple-600 text-xs">
        Vous utilisez un build master non taggé. La dernière version stable est
        <span class="font-mono font-bold">{{ report.latestStable?.name ?? '—' }}</span>.
      </p>
      <a
        v-if="report.latestStable"
        :href="`https://github.com/quantum/esos/releases/tag/${report.latestStable.name}`"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 text-xs text-purple-700 hover:underline"
      >
        Voir le tag {{ report.latestStable.name }} sur GitHub
        <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" />
      </a>
    </div>

    <!-- À jour -->
    <div
      v-else-if="diff === 'up-to-date'"
      class="rounded-lg bg-green-50 border border-green-200 p-3 text-sm flex items-center gap-3"
    >
      <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 shrink-0" />
      <div>
        <p class="text-green-800 font-medium">ESOS est à jour</p>
        <p class="text-green-600 text-xs">Version {{ report.installed.version }} — dernière stable disponible</p>
      </div>
    </div>

    <!-- Mise à jour disponible -->
    <div v-else-if="['patch', 'minor', 'major'].includes(diff)" class="space-y-3">
      <div
        class="rounded-lg border p-3 text-sm flex items-start gap-3"
        :class="updateClass"
      >
        <UIcon name="i-heroicons-arrow-up-circle" class="w-5 h-5 shrink-0 mt-0.5" :class="iconClass" />
        <div class="space-y-1">
          <p class="font-medium" :class="titleClass">
            Mise à jour <span class="uppercase">{{ diff }}</span> disponible
          </p>
          <div class="flex items-center gap-2 font-mono text-xs">
            <span class="text-gray-500">{{ report.installed.version }}</span>
            <UIcon name="i-heroicons-arrow-right" class="w-3 h-3 text-gray-400" />
            <span class="font-bold" :class="versionClass">{{ report.latestStable?.name }}</span>
          </div>
          <p v-if="report.behindCount > 1" class="text-xs text-gray-500">
            {{ report.behindCount }} versions en retard
          </p>
        </div>
      </div>

      <div v-if="report.latestStable" class="flex flex-wrap gap-2">
        <a
          :href="report.latestStable.downloadUrl"
          class="inline-flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          <UIcon name="i-heroicons-arrow-down-tray" class="w-3.5 h-3.5" />
          Télécharger {{ report.latestStable.name }} (.zip)
        </a>
        <a
          :href="`https://github.com/quantum/esos/compare/${report.installed.version}...${report.latestStable.name}`"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          <UIcon name="i-heroicons-code-bracket" class="w-3.5 h-3.5" />
          Voir les changements
        </a>
      </div>
    </div>

    <!-- Inconnu -->
    <div v-else class="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-500">
      Impossible de comparer la version installée avec GitHub.
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ESOSVersionReport } from '~/server/utils/types'

const props = defineProps<{ report: ESOSVersionReport; diff: string }>()

const updateClass = computed(() => ({
  'bg-blue-50  border-blue-200':  props.diff === 'patch',
  'bg-amber-50 border-amber-200': props.diff === 'minor',
  'bg-red-50   border-red-200':   props.diff === 'major',
}))

const iconClass = computed(() => ({
  'text-blue-500':  props.diff === 'patch',
  'text-amber-500': props.diff === 'minor',
  'text-red-500':   props.diff === 'major',
}))

const titleClass = computed(() => ({
  'text-blue-800':  props.diff === 'patch',
  'text-amber-800': props.diff === 'minor',
  'text-red-800':   props.diff === 'major',
}))

const versionClass = computed(() => ({
  'text-blue-700':  props.diff === 'patch',
  'text-amber-700': props.diff === 'minor',
  'text-red-700':   props.diff === 'major',
}))
</script>
