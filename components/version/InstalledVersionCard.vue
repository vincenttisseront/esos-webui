<template>
  <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Version installée</p>

    <div class="flex items-center gap-3">
      <span
        class="font-mono text-lg font-bold"
        :class="installed.buildType === 'master' ? 'text-purple-700' : 'text-gray-900 dark:text-gray-100'"
      >
        {{ installed.raw || '—' }}
      </span>
      <UBadge :color="badgeColor" size="xs">{{ badgeLabel }}</UBadge>
    </div>

    <!-- Détail build master -->
    <div v-if="installed.buildType === 'master'" class="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
      <div class="flex gap-2">
        <span class="text-gray-400 w-20">Branche</span>
        <span class="font-mono text-purple-600">{{ installed.branch }}</span>
      </div>
      <div class="flex gap-2">
        <span class="text-gray-400 w-20">Commit</span>
        <a
          :href="`https://github.com/quantum/esos/commit/${installed.commitHash}`"
          target="_blank"
          rel="noopener noreferrer"
          class="font-mono text-blue-600 hover:underline"
        >{{ installed.commitHash }}</a>
      </div>
    </div>

    <!-- Détail version stable -->
    <div v-else-if="installed.buildType === 'stable'" class="text-xs text-gray-500 dark:text-gray-400">
      <div class="flex gap-2">
        <span class="text-gray-400 w-20">Branche</span>
        <span class="font-mono">{{ installed.version?.split('.')[0] }}.x.x</span>
      </div>
    </div>

    <!-- Options de build (si master) -->
    <div v-if="installed.buildOpts?.length" class="space-y-1.5">
      <p class="text-xs text-gray-400">Options de build</p>
      <div class="flex flex-wrap gap-1.5">
        <UTooltip
          v-for="opt in installed.buildOpts"
          :key="opt.flag"
          :text="opt.description"
        >
          <span class="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded font-mono cursor-default">
            <span class="font-bold">{{ opt.flag }}</span>
          </span>
        </UTooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { InstalledESOSVersion } from '~/server/utils/types'

const props = defineProps<{ installed: InstalledESOSVersion }>()

const badgeColor = computed(() => ({
  stable:  'green',
  master:  'purple',
  unknown: 'gray',
}[props.installed.buildType] as 'green' | 'purple' | 'gray'))

const badgeLabel = computed(() => ({
  stable:  'Stable',
  master:  'Master / Dev',
  unknown: 'Inconnu',
}[props.installed.buildType]))
</script>
