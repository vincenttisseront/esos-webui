<template>
  <UModal v-model="open">
    <UCard class="max-w-lg">
      <template #header>{{ t('lvm.wizard.vg_create.title') }}</template>
      <div class="space-y-3">
        <UFormGroup :label="t('lvm.wizard.vg_create.name')">
          <UInput v-model="vgName" placeholder="vg_data" />
        </UFormGroup>
        <p class="text-sm text-gray-500">{{ t('lvm.wizard.vg_create.pv_hint') }}</p>
        <div class="space-y-1 max-h-40 overflow-y-auto">
          <label
            v-for="pv in lvm.orphanPvs"
            :key="pv.path"
            class="flex items-center gap-2 text-sm cursor-pointer"
          >
            <input v-model="selectedPvs" type="checkbox" :value="pv.path" class="accent-primary-500">
            <span class="font-mono">{{ pv.path }}</span>
            <span class="text-gray-500">({{ formatBytes(pv.sizeBytes) }})</span>
          </label>
        </div>
        <UAlert v-if="preflight?.blockers.length" color="red" variant="soft" :title="preflight.blockers.join(' · ')" />
        <UFormGroup v-if="preflight?.ok" :label="t('lvm.confirm.label')">
          <UInput v-model="confirmation" :placeholder="preflight.requiredConfirmation" />
        </UFormGroup>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="open = false">{{ t('lvm.wizard.cancel') }}</UButton>
          <UButton color="primary" :loading="busy" :disabled="!preflight?.ok" @click="execute">{{ t('lvm.wizard.execute') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; sanId: string }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; done: [] }>()
const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const open = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})
const vgName = ref('')
const selectedPvs = ref<string[]>([])
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof lvm.preflight>> | null>(null)
const busy = ref(false)

function formatBytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KiB', 'MiB', 'GiB']
  let i = 0; let v = n
  while (v >= 1024 && i < 3) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}

watch([vgName, selectedPvs], async () => {
  if (!vgName.value || !selectedPvs.value.length) { preflight.value = null; return }
  try {
    preflight.value = await lvm.preflight({
      action: 'vgcreate',
      payload: { name: vgName.value, pvPaths: [...selectedPvs.value], confirmation: '' },
    })
  } catch { preflight.value = null }
})

async function execute() {
  if (!preflight.value?.ok) return
  busy.value = true
  try {
    await lvm.createVg({
      name: vgName.value,
      pvPaths: [...selectedPvs.value],
      confirmation: confirmation.value.trim(),
    })
    toast.add({ title: t('lvm.wizard.vg_create.success'), color: 'green' })
    open.value = false
    emit('done')
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  } finally {
    busy.value = false
  }
}
</script>
