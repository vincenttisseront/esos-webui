<template>
  <UAlert
    v-if="items.length"
    color="amber"
    icon="i-heroicons-exclamation-triangle"
    variant="soft"
    :title="t('advanced_storage.deprecated.title')"
    :description="t('advanced_storage.deprecated.body')"
  >
    <template #actions>
      <div class="flex flex-wrap gap-2 mt-2">
        <UBadge
          v-for="item in items"
          :key="item.id"
          color="amber"
          variant="subtle"
          :label="t(`advanced_storage.deprecated.${item.id}` as 'advanced_storage.deprecated.lessfs')"
        />
      </div>
    </template>
  </UAlert>
</template>

<script setup lang="ts">
import type { DeprecatedTechStatus } from '~/types/advanced-storage'

defineProps<{ items: DeprecatedTechStatus[] }>()
const { t } = useEsosI18n()
</script>
