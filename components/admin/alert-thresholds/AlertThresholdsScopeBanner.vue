<script setup lang="ts">
const { t } = useEsosI18n()
</script>

<template>
  <UAlert
    color="blue"
    icon="i-heroicons-globe-alt"
    :title="t('admin.alertThresholds.scope.title')"
  >
    <p class="text-sm">{{ t('admin.alertThresholds.scope.globalBanner') }}</p>
    <p class="text-sm mt-2 text-gray-600 dark:text-gray-400">
      {{ t('admin.alertThresholds.scope.perSanNote') }}
    </p>
  </UAlert>
</template>
