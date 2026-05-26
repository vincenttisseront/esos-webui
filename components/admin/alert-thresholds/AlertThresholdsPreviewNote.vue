<script setup lang="ts">
const { t } = useEsosI18n()
</script>

<template>
  <UAlert
    color="gray"
    icon="i-heroicons-information-circle"
    :title="t('admin.alertThresholds.preview.noteTitle')"
    :description="t('admin.alertThresholds.preview.noteBody')"
  />
</template>
