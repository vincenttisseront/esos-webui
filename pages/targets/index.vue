<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <p class="text-sm text-gray-500">{{ t('storage.targets.list.countLine', { count: filtered.length }) }}</p>
      <UInput
        v-model="search"
        :placeholder="t('storage.targets.list.searchPlaceholder')"
        icon="i-heroicons-magnifying-glass"
        class="w-64"
      />
    </div>

    <TargetTable :targets="filtered" :loading="pending" />
  </div>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()
const { overview, pending } = useOverview()
const search = ref('')

const filtered = computed(() =>
  (overview.value?.targets ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
)
</script>
