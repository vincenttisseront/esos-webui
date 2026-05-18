<template>
  <div class="space-y-6">
    <!-- Loading / error state -->
    <div v-if="status === 'pending'" class="flex items-center justify-center py-20">
      <div class="text-center space-y-2">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-300 animate-spin mx-auto" />
        <p class="text-sm text-gray-400">Collecte des informations système…</p>
      </div>
    </div>

    <UAlert
      v-else-if="status === 'error'"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-circle"
      title="Erreur de collecte"
      :description="errorMessage"
    />

    <template v-else-if="inv">
      <!-- Hero card -->
      <SystemHeroCard :inv="inv" :loading="refreshing" @refresh="forceRefresh" />

      <!-- Row 1: CPU + Memory -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UCard>
          <CPUCard :cpu="inv.cpu" />
        </UCard>
        <UCard>
          <MemoryOverviewCard :mem="inv.memory" />
          <MemoryModulesTable :modules="inv.memModules" class="mt-4" />
        </UCard>
      </div>

      <!-- Row 2: Disks -->
      <UCard>
        <DiskTable :disks="inv.disks" />
      </UCard>

      <!-- Row 3: RAID logiciel (si présent) -->
      <UCard v-if="inv.raids?.length">
        <SoftRAIDCard :raids="inv.raids" />
      </UCard>

      <!-- Row 4: Network -->
      <UCard>
        <NetworkTable :network="inv.network" />
      </UCard>

      <!-- Row 5: PCI -->
      <UCard v-if="inv.pci?.length">
        <PCIDevicesTable :devices="inv.pci" />
      </UCard>

      <!-- Row 6: IPMI -->
      <UCard>
        <IPMIPanel :ipmi="inv.ipmi" />
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { SystemInventory } from '~/server/utils/types'

const { effective } = useSelectedSan()

const refreshing = ref(false)
const refreshKey  = ref(0)

const sanId = computed(() => effective.value?.id ?? null)

const { data, status, error, refresh } = useFetch<SystemInventory>(
  () => (sanId.value ? `/api/san/${sanId.value}/inventory` : null) as string,
  {
    immediate:   true,
    lazy:        true,
    watch:       [sanId],
    key:         computed(() => `inventory-${sanId.value}-${refreshKey.value}`),
  },
)

const inv          = computed(() => data.value ?? null)
const errorMessage = computed(() => error.value?.message ?? 'Impossible de joindre le SAN')

async function forceRefresh() {
  if (!sanId.value) return
  refreshing.value = true
  try {
    // ?refresh=1 invalidates server cache
    await $fetch(`/api/san/${sanId.value}/inventory?refresh=1`)
    refreshKey.value++
    await refresh()
  } finally {
    refreshing.value = false
  }
}
</script>
