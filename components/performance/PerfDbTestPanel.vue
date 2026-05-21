<template>
  <!-- Panneau test connexion DB -->
  <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Test de connexion DB</h3>
      <UButton
        size="xs"
        :loading="perf.dbTestLoading"
        icon="i-heroicons-bolt"
        label="Tester"
        @click="perf.testDb()"
      />
    </div>

    <div v-if="result" class="space-y-2">
      <!-- Résultat OK -->
      <div v-if="result.ok" class="flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
        <UIcon name="i-heroicons-check-circle" class="w-5 h-5 shrink-0 mt-0.5" />
        <div class="space-y-1">
          <p class="font-medium">Connexion {{ result.dbType === 'postgres' ? 'PostgreSQL' : 'MySQL' }} réussie</p>
          <p v-if="result.latencyMs !== undefined" class="text-xs text-gray-500 dark:text-gray-400">
            Latence : {{ result.latencyMs }} ms
          </p>
          <p v-if="result.tables?.length" class="text-xs text-gray-500 dark:text-gray-400">
            Tables : {{ result.tables.join(', ') }}
          </p>
          <p v-if="result.sampleCount !== undefined" class="text-xs text-gray-500 dark:text-gray-400">
            {{ result.sampleCount.toLocaleString() }} samples
            <template v-if="result.oldestSampleAt && result.newestSampleAt">
              · du {{ new Date(result.oldestSampleAt).toLocaleDateString() }}
              au {{ new Date(result.newestSampleAt).toLocaleDateString() }}
            </template>
          </p>
        </div>
      </div>

      <!-- Résultat KO -->
      <div v-else class="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
        <UIcon name="i-heroicons-x-circle" class="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p class="font-medium">Connexion échouée</p>
          <p class="text-xs mt-1">{{ result.error }}</p>
        </div>
      </div>
    </div>

    <p v-else class="text-xs text-gray-400">
      Cliquez sur Tester pour valider la connexion à la base de données.
    </p>
  </div>
</template>

<script setup lang="ts">
const perf = usePerfStore()
const result = computed(() => perf.dbTestResult)
</script>
