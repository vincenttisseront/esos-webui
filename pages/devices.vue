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

    <DeviceTable :devices="filtered" :loading="pending" :usage="lunUsage" :lun-tooltip="lunTooltip">
      <template #usage="{ device: d }">
        <span>{{ lunUsage(d.name) }}</span>
        <NuxtLink
          v-if="targetLinks(d.name).length === 1"
          :to="`/targets/${encodeURIComponent(targetLinks(d.name)[0])}`"
          class="text-primary-500 hover:underline ml-1 text-xs"
        >
          {{ t('storage.devices.usage.viewTargets') }}
        </NuxtLink>
        <NuxtLink
          v-else-if="targetLinks(d.name).length > 1"
          to="/targets"
          class="text-primary-500 hover:underline ml-1 text-xs"
        >
          {{ t('storage.devices.usage.viewTargets') }}
        </NuxtLink>
      </template>
    </DeviceTable>
  </div>
</template>

<script setup lang="ts">
import { isDeviceMapped, deviceUsageByTarget } from '~/utils/scst-unmapped-devices'

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
  if (!overview.value) return '—'
  if (!isDeviceMapped(overview.value, deviceName)) {
    return t('storage.devices.usage.unmapped') as string
  }
  const allLuns = overview.value.targets
    .flatMap((tg) => tg.groups)
    .flatMap((g) => g.luns)
    .filter((l) => l.device === deviceName)
  if (allLuns.length === 0) return t('storage.devices.usage.unmapped') as string
  const ro = allLuns.filter((l) => l.readOnly).length
  const base = t('storage.devices.usage.count', { count: allLuns.length }) as string
  return ro > 0 ? base + (t('storage.devices.usage.withRoSuffix', { ro }) as string) : base
}

function lunTooltip(deviceName: string): string | undefined {
  if (!overview.value) return undefined
  const targets = deviceUsageByTarget(overview.value, deviceName)
  return targets.length ? targets.join(', ') : undefined
}

function targetLinks(deviceName: string): string[] {
  return overview.value ? deviceUsageByTarget(overview.value, deviceName) : []
}
</script>
