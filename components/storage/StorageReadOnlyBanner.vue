<template>
  <UAlert
    v-if="readOnly"
    color="amber"
    variant="soft"
    icon="i-heroicons-lock-closed"
    :title="t('storage.readonly.banner')"
  />
</template>

<script setup lang="ts">
defineProps<{ readOnly?: boolean }>()
const { t } = useEsosI18n()
</script>
