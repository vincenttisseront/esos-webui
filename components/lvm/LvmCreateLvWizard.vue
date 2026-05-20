<template>
  <LvmWizardModalShell
    :title="t('lvm.wizard.lv_create.title')"
    :step="1"
    :total-steps="1"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-3">
      <UFormGroup :label="t('lvm.wizard.lv_create.vg')">
        <USelect v-model="vgName" :items="vgOptions" value-attribute="value" option-attribute="label" />
      </UFormGroup>
      <UFormGroup :label="t('lvm.wizard.lv_create.name')">
        <UInput v-model="lvName" />
      </UFormGroup>
      <UFormGroup :label="t('lvm.wizard.lv_create.size_gib')">
        <UInput v-model.number="sizeGib" type="number" min="1" />
      </UFormGroup>
      <p v-if="selectedVg" class="text-xs text-gray-500">
        {{ t('lvm.wizard.lv_create.free', { size: formatBytes(selectedVg.freeBytes) }) }}
      </p>
      <UAlert v-if="preflight?.blockers.length" color="red" variant="soft" :title="preflight.blockers.join(' · ')" />
      <UFormGroup v-if="preflight?.ok" :label="t('lvm.confirm.label')">
        <UInput v-model="confirmation" :placeholder="preflight.requiredConfirmation" />
      </UFormGroup>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="emit('cancel')">{{ t('lvm.wizard.cancel') }}</UButton>
        <UButton color="primary" :loading="busy" :disabled="!preflight?.ok" @click="execute">{{ t('lvm.wizard.execute') }}</UButton>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
const props = defineProps<{ sanId: string }>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const vgName = ref('')
const lvName = ref('')
const sizeGib = ref(10)
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof lvm.preflight>> | null>(null)
const busy = ref(false)

const vgOptions = computed(() =>
  lvm.vgs.filter(v => !v.clustered).map(v => ({ label: `${v.name} (${formatBytes(v.freeBytes)} free)`, value: v.name })),
)
const selectedVg = computed(() => lvm.vgs.find(v => v.name === vgName.value))

function formatBytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KiB', 'MiB', 'GiB']
  let i = 0
  let v = n
  while (v >= 1024 && i < 3) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}

onMounted(() => {
  lvm.setSanId(props.sanId)
  if (vgOptions.value.length) vgName.value = vgOptions.value[0].value
})

watch([vgName, lvName, sizeGib], async () => {
  if (!vgName.value || !lvName.value || !sizeGib.value) { preflight.value = null; return }
  const sizeBytes = Math.floor(sizeGib.value * 1024 ** 3)
  try {
    preflight.value = await lvm.preflight({
      action: 'lvcreate',
      payload: { vgName: vgName.value, name: lvName.value, sizeBytes, confirmation: '' },
    })
  } catch {
    preflight.value = null
  }
})

async function execute() {
  if (!preflight.value?.ok) return
  busy.value = true
  try {
    await lvm.createLv({
      vgName: vgName.value,
      name: lvName.value,
      sizeBytes: Math.floor(sizeGib.value * 1024 ** 3),
      confirmation: confirmation.value.trim(),
    })
    toast.add({ title: t('lvm.wizard.lv_create.success'), color: 'green' })
    emit('close')
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  } finally {
    busy.value = false
  }
}
</script>
