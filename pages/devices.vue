<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <p class="text-sm text-gray-500">{{ t('storage.devices.list.countLine', { count: filtered.length }) }}</p>
      <div class="flex gap-2">
        <USelect
          v-model="handlerFilter"
          :items="handlerOptions"
          :placeholder="t('storage.devices.list.handlerFilterPlaceholder')"
          class="w-48"
        />
        <UInput
          v-model="search"
          :placeholder="t('storage.devices.list.searchPlaceholder')"
          icon="i-heroicons-magnifying-glass"
          class="w-52"
        />
      </div>
    </div>

    <DeviceTable :devices="filtered" :loading="pending" :usage="lunUsage" />
  </div>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()
const { overview, pending } = useOverview()

const search = ref('')
const handlerFilter = ref<string | null>(null)

const handlerOptions = computed(() => {
  const handlers = [
    ...new Set((overview.value?.devices ?? []).map((d) => d.handler)),
  ]
  return handlers.map((h) => ({ label: h, value: h }))
})

const filtered = computed(() =>
  (overview.value?.devices ?? []).filter((d) => {
    const matchSearch = d.name.toLowerCase().includes(search.value.toLowerCase())
    const matchHandler = !handlerFilter.value || d.handler === handlerFilter.value

    return matchSearch && matchHandler
  }),
)

function lunUsage(deviceName: string): string {
  const allLuns = (overview.value?.targets ?? [])
    .flatMap((tg) => tg.groups)
    .flatMap((g) => g.luns)
    .filter((l) => l.device === deviceName)
  if (allLuns.length === 0) return '—'
  const ro = allLuns.filter((l) => l.readOnly).length
  const base = t('storage.devices.usage.count', { count: allLuns.length }) as string
  return ro > 0 ? base + (t('storage.devices.usage.withRoSuffix', { ro }) as string) : base
}
</script>
