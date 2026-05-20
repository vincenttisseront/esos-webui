<template>
  <div class="space-y-4">
    <UAlert
      v-for="(alert, i) in lvm.alerts"
      :key="i"
      :title="alert.message"
      :color="alert.severity === 'critical' ? 'red' : 'amber'"
      variant="soft"
    />

    <div v-if="isClustered" class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
      {{ t('lvm.cluster.local_symmetric_hint') }}
    </div>

    <div class="flex flex-wrap gap-2 justify-between items-center">
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" color="primary" icon="i-heroicons-plus" :disabled="!canMutate" @click="showPvWizard = true">
          {{ t('lvm.pv.create_action') }}
        </UButton>
        <UButton size="sm" color="primary" variant="soft" icon="i-heroicons-plus" :disabled="!canMutate || !lvm.orphanPvs.length" @click="showVgWizard = true">
          {{ t('lvm.vg.create_action') }}
        </UButton>
        <UButton size="sm" color="primary" variant="soft" icon="i-heroicons-plus" :disabled="!canMutate || !lvm.vgs.length" @click="showLvWizard = true">
          {{ t('lvm.lv.create_action') }}
        </UButton>
      </div>
      <UButton size="sm" color="gray" variant="ghost" icon="i-heroicons-arrow-path" :loading="lvm.loading" @click="lvm.fetchOverview(true)">
        {{ t('lvm.overview.refresh') }}
      </UButton>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <UCard>
        <div class="text-center py-2">
          <div class="text-2xl font-bold">{{ lvm.pvs.length }}</div>
          <div class="text-sm text-gray-500">{{ t('lvm.overview.pv_count') }}</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center py-2">
          <div class="text-2xl font-bold">{{ lvm.vgs.length }}</div>
          <div class="text-sm text-gray-500">{{ t('lvm.overview.vg_count') }}</div>
        </div>
      </UCard>
      <UCard>
        <div class="text-center py-2">
          <div class="text-2xl font-bold">{{ lvm.lvs.length }}</div>
          <div class="text-sm text-gray-500">{{ t('lvm.overview.lv_count') }}</div>
        </div>
      </UCard>
    </div>

    <UCard>
      <template #header><h3 class="text-sm font-medium">{{ t('lvm.pv.table_title') }}</h3></template>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-2 pr-3">PV</th>
              <th class="py-2 pr-3">VG</th>
              <th class="py-2 pr-3">{{ t('lvm.col.size') }}</th>
              <th class="py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in lvm.pvs" :key="row.path" class="border-b border-gray-100 dark:border-gray-800">
              <td class="py-2 font-mono">{{ row.path }}</td>
              <td class="py-2">{{ row.vgName || '—' }}</td>
              <td class="py-2">{{ formatBytes(row.sizeBytes) }}</td>
              <td class="py-2 text-right">
                <UButton v-if="!row.vgName && canMutate" size="xs" color="red" variant="ghost" @click="confirmRemovePv(row.path)">
                  {{ t('lvm.pv.remove') }}
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard>
      <template #header><h3 class="text-sm font-medium">{{ t('lvm.vg.table_title') }}</h3></template>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-2 pr-3">VG</th>
              <th class="py-2 pr-3">{{ t('lvm.col.size_free') }}</th>
              <th class="py-2 pr-3">PVs</th>
              <th class="py-2 pr-3">LVs</th>
              <th class="py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in lvm.vgs" :key="row.name" class="border-b border-gray-100 dark:border-gray-800">
              <td class="py-2 font-mono">{{ row.name }}</td>
              <td class="py-2">{{ formatBytes(row.sizeBytes) }} / {{ formatBytes(row.freeBytes) }}</td>
              <td class="py-2">{{ row.pvCount }}</td>
              <td class="py-2">{{ row.lvCount }}</td>
              <td class="py-2 text-right">
                <UBadge v-if="row.clustered" color="amber" size="xs" :label="t('lvm.vg.clustered')" />
                <UButton v-if="canMutate && !row.clustered" size="xs" color="red" variant="ghost" class="ml-2" @click="confirmRemoveVg(row.name)">
                  {{ t('lvm.vg.remove') }}
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard>
      <template #header><h3 class="text-sm font-medium">{{ t('lvm.lv.table_title') }}</h3></template>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-2 pr-3">LV</th>
              <th class="py-2 pr-3">VG</th>
              <th class="py-2 pr-3">{{ t('lvm.col.size') }}</th>
              <th class="py-2 pr-3">SCST</th>
              <th class="py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in lvm.lvs" :key="row.path" class="border-b border-gray-100 dark:border-gray-800">
              <td class="py-2 font-mono">{{ row.path }}</td>
              <td class="py-2">{{ row.vgName }}</td>
              <td class="py-2">{{ formatBytes(row.sizeBytes) }}</td>
              <td class="py-2">
                <span v-if="row.scstDeviceNames?.length">{{ row.scstDeviceNames.join(', ') }}</span>
                <UButton v-else-if="canMutate" size="xs" variant="soft" @click="openScstWizard(row)">{{ t('lvm.lv.bind_scst') }}</UButton>
              </td>
              <td class="py-2 text-right">
                <UButton v-if="canMutate && !row.scstDeviceNames?.length" size="xs" color="red" variant="ghost" @click="confirmRemoveLv(row)">
                  {{ t('lvm.lv.remove') }}
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard v-if="eligibleCandidates.length">
      <template #header><h3 class="text-sm font-medium">{{ t('lvm.candidate.table_title') }}</h3></template>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 border-b">
              <th class="py-2 pr-3">{{ t('lvm.col.device') }}</th>
              <th class="py-2 pr-3">{{ t('lvm.col.kind') }}</th>
              <th class="py-2">{{ t('lvm.col.size') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in eligibleCandidates" :key="row.path" class="border-b border-gray-100 dark:border-gray-800">
              <td class="py-2 font-mono">{{ row.path }}</td>
              <td class="py-2">{{ row.kind }}</td>
              <td class="py-2">{{ formatBytes(row.sizeBytes) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <LvmCreatePvWizard v-model="showPvWizard" :san-id="sanId" :is-clustered="isClustered" @done="onDone" />
    <LvmCreateVgWizard v-model="showVgWizard" :san-id="sanId" @done="onDone" />
    <LvmCreateLvWizard v-model="showLvWizard" :san-id="sanId" @done="onDone" />
    <LvmBindScstWizard v-model="showScstWizard" :lv="scstLv" @done="onDone" />
  </div>
</template>

<script setup lang="ts">
import type { LogicalVolume } from '~/types/lvm'

const props = defineProps<{
  sanId: string
  isClustered?: boolean
  readOnly?: boolean
}>()

const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const showPvWizard = ref(false)
const showVgWizard = ref(false)
const showLvWizard = ref(false)
const showScstWizard = ref(false)
const scstLv = ref<LogicalVolume | null>(null)

const canMutate = computed(() => !props.readOnly && !props.isClustered)

watch(() => props.sanId, (id) => {
  if (id) {
    lvm.setSanId(id)
    lvm.fetchOverview()
  }
}, { immediate: true })

const eligibleCandidates = computed(() => lvm.candidates.filter(c => c.eligible))

function formatBytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}

function onDone() {
  lvm.fetchOverview(true)
}

function openScstWizard(lv: LogicalVolume) {
  scstLv.value = lv
  showScstWizard.value = true
}

async function confirmRemovePv(path: string) {
  if (!canMutate.value) return
  const pre = await lvm.preflight({ action: 'pvremove', payload: { path, confirmation: '' } })
  const conf = prompt(pre.requiredConfirmation)
  if (conf !== pre.requiredConfirmation) return
  try {
    await lvm.removePv({ path, confirmation: conf })
    toast.add({ title: t('lvm.pv.removed'), color: 'green' })
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  }
}

async function confirmRemoveVg(name: string) {
  if (!canMutate.value) return
  const pre = await lvm.preflight({ action: 'vgremove', payload: { name, confirmation: '' } })
  const conf = prompt(pre.requiredConfirmation)
  if (conf !== pre.requiredConfirmation) return
  try {
    await lvm.removeVg({ name, confirmation: conf })
    toast.add({ title: t('lvm.vg.removed'), color: 'green' })
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  }
}

async function confirmRemoveLv(lv: LogicalVolume) {
  if (!canMutate.value) return
  const pre = await lvm.preflight({ action: 'lvremove', payload: { vgName: lv.vgName, name: lv.name, confirmation: '' } })
  const conf = prompt(pre.requiredConfirmation)
  if (conf !== pre.requiredConfirmation) return
  try {
    await lvm.removeLv({ vgName: lv.vgName, name: lv.name, confirmation: conf })
    toast.add({ title: t('lvm.lv.removed'), color: 'green' })
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  }
}
</script>
