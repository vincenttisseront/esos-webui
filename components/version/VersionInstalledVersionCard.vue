<template>
  <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Version installée</p>

    <!-- Version inconnue ou SSH non disponible -->
    <div v-if="!installed.raw || installed.buildType === 'unknown'" class="rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
      <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4 shrink-0" />
      Version non détectée (SSH indisponible ou fichier /etc/esos-release absent)
    </div>

    <!-- Build stable -->
    <template v-else-if="installed.buildType === 'stable'">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-tag" class="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <p class="text-xl font-bold font-mono text-gray-900 dark:text-gray-100">{{ installed.version }}</p>
          <p class="text-xs text-gray-400">Build stable</p>
        </div>
      </div>
      <div class="text-xs text-gray-400 font-mono bg-gray-50 dark:bg-gray-950 rounded px-3 py-2 border border-gray-100 dark:border-gray-800">
        {{ installed.raw }}
      </div>
    </template>

    <!-- Build master -->
    <template v-else-if="installed.buildType === 'master'">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-code-bracket" class="w-5 h-5 text-purple-500" />
        </div>
        <div>
          <p class="text-sm font-bold font-mono text-gray-900 dark:text-gray-100">{{ installed.branch }}</p>
          <p class="text-xs text-gray-400">
            Build de développement · commit
            <a
              :href="`https://github.com/quantum/esos/commit/${installed.commitHash}`"
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono text-blue-500 hover:underline"
            >{{ installed.commitHash?.slice(0, 7) }}</a>
          </p>
        </div>
      </div>

      <!-- Options de build -->
      <div v-if="installed.buildOpts?.length" class="space-y-1">
        <p class="text-xs text-gray-400 font-medium">Options de build :</p>
        <div class="flex flex-wrap gap-1">
          <UTooltip
            v-for="opt in installed.buildOpts"
            :key="opt.flag"
            :text="opt.description"
          >
            <UBadge :label="opt.flag" color="purple" variant="subtle" size="xs" class="font-mono cursor-default" />
          </UTooltip>
        </div>
      </div>

      <div class="text-xs text-gray-400 font-mono bg-gray-50 dark:bg-gray-950 rounded px-3 py-2 border border-gray-100 dark:border-gray-800">
        {{ installed.raw }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { InstalledESOSVersion } from '~/server/utils/types'

defineProps<{ installed: InstalledESOSVersion }>()
</script>
