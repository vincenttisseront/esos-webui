<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <!-- En-tête -->
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Version ESOS</h1>
        <p class="text-sm text-gray-500 mt-1">Suivi de version du système ESOS installé</p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="store.report" class="text-xs text-gray-400">
          Scanné {{ timeAgo }}
        </span>
        <UButton
          icon="i-heroicons-arrow-path"
          size="sm"
          color="gray"
          variant="soft"
          :loading="store.loading"
          @click="store.fetch(true)"
        >
          Actualiser
        </UButton>
      </div>
    </header>

    <!-- Chargement initial -->
    <div v-if="store.loading && !store.report" class="flex items-center justify-center py-20 text-gray-400 gap-3">
      <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin" />
      Récupération des informations de version…
    </div>

    <!-- Erreur -->
    <UAlert
      v-else-if="store.error"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="store.error"
    />

    <template v-else-if="store.report">
      <!-- Grid principal -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VersionInstalledVersionCard :installed="store.report.installed" />
        <VersionCompareCard :report="store.report" :diff="store.report.diff" />
      </div>

      <!-- Historique des tags -->
      <VersionHistoryTable
        :tags="store.report.allTags"
        :installed-version="store.report.installed.version"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ ssr: false })

const store = useESOSVersionStore()

onMounted(() => {
  store.fetch()
})

const timeAgo = computed(() => {
  if (!store.report) return ''
  const diffSec = Math.floor((Date.now() - store.report.scannedAt) / 1000)
  if (diffSec < 60)  return `il y a ${diffSec}s`
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)}min`
  return `il y a ${Math.floor(diffSec / 3600)}h`
})
</script>
