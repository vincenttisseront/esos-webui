<template>
  <AdminSection title="Zone de Danger" icon="i-heroicons-exclamation-triangle" :danger="true">
    <div class="space-y-3">

      <!-- Vider le cache -->
      <div class="flex items-center justify-between py-2">
        <div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Vider le cache applicatif</p>
          <p class="text-xs text-gray-400">
            Force le rechargement de scst.conf et du sysfs au prochain appel API
          </p>
        </div>
        <UButton
          size="sm"
          color="gray"
          variant="outline"
          icon="i-heroicons-arrow-path"
          label="Vider"
          :loading="clearingCache"
          @click="handleClearCache"
        />
      </div>

      <UDivider />

      <!-- Purger les métriques -->
      <div class="flex items-center justify-between py-2">
        <div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Purger toutes les métriques</p>
          <p class="text-xs text-gray-400">
            Supprime l'intégralité de l'historique I/O et système.
            <strong class="text-red-600">Action irréversible.</strong>
          </p>
        </div>
        <UButton
          size="sm"
          color="red"
          variant="outline"
          icon="i-heroicons-trash"
          label="Purger"
          :loading="purging"
          @click="handlePurge"
        />
      </div>

    </div>
  </AdminSection>
</template>

<script setup lang="ts">
const admin        = useAdminStore()
const clearingCache = ref(false)
const purging       = ref(false)

async function handleClearCache() {
  clearingCache.value = true
  try { await admin.clearCache() }
  finally { clearingCache.value = false }
}

async function handlePurge() {
  const confirmed = await modalDestructive({
    title:   'Purger toutes les métriques',
    message: 'Supprime l\'intégralité de l\'historique I/O et système. Cette action est irréversible.',
  })
  if (!confirmed) return
  purging.value = true
  try { await admin.purgeMetrics() }
  finally { purging.value = false }
}
</script>
