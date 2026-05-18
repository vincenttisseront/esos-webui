<template>
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div class="esos-card p-4 text-center">
      <p class="text-2xl font-bold text-gray-800">{{ report.totalCount }}</p>
      <p class="text-xs text-gray-400 mt-0.5">{{ t('admin.dependencies.stats.packages') }}</p>
    </div>

    <div
      class="esos-card p-4 text-center cursor-pointer transition-shadow hover:shadow-md"
      :class="report.majorUpdates > 0 ? 'ring-1 ring-red-200' : ''"
      @click="setFilter('major')"
    >
      <p class="text-2xl font-bold" :class="report.majorUpdates > 0 ? 'text-red-600' : 'text-gray-300'">
        {{ report.majorUpdates }}
      </p>
      <p class="text-xs mt-0.5" :class="report.majorUpdates > 0 ? 'text-red-500' : 'text-gray-400'">
        {{ t('admin.dependencies.stats.major') }}
      </p>
    </div>

    <div
      class="esos-card p-4 text-center cursor-pointer transition-shadow hover:shadow-md"
      :class="report.minorUpdates > 0 ? 'ring-1 ring-amber-200' : ''"
      @click="setFilter('minor')"
    >
      <p class="text-2xl font-bold" :class="report.minorUpdates > 0 ? 'text-amber-500' : 'text-gray-300'">
        {{ report.minorUpdates }}
      </p>
      <p class="text-xs mt-0.5" :class="report.minorUpdates > 0 ? 'text-amber-400' : 'text-gray-400'">
        {{ t('admin.dependencies.stats.minor') }}
      </p>
    </div>

    <div
      class="esos-card p-4 text-center cursor-pointer transition-shadow hover:shadow-md"
      @click="setFilter('patch')"
    >
      <p class="text-2xl font-bold" :class="report.patchUpdates > 0 ? 'text-blue-500' : 'text-gray-300'">
        {{ report.patchUpdates }}
      </p>
      <p class="text-xs mt-0.5" :class="report.patchUpdates > 0 ? 'text-blue-400' : 'text-gray-400'">
        {{ t('admin.dependencies.stats.patch') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DependenciesReport, SemverDiff } from '~/server/utils/types'

defineProps<{ report: DependenciesReport }>()
const { t } = useEsosI18n()
const deps = useDepsStore()

function setFilter(diff: SemverDiff) {
  deps.filterDiff = deps.filterDiff === diff ? 'all' : diff
}
</script>
