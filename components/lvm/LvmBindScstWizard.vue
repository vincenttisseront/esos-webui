<template>
  <LvmWizardModalShell
    :title="t('lvm.wizard.scst_device.title')"
    :step="1"
    :total-steps="1"
    icon="i-heroicons-circle-stack"
  >
    <div v-if="lv" class="space-y-3">
      <p class="text-sm font-mono">{{ lv.path }}</p>
      <UFormGroup :label="t('lvm.wizard.scst_device.name')">
        <UInput v-model="deviceName" :placeholder="suggestedName" />
      </UFormGroup>
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
import type { LogicalVolume } from '~/types/lvm'

const props = defineProps<{ sanId: string; lv: LogicalVolume }>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const lv = computed(() => props.lv)
const deviceName = ref('')
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof lvm.preflight>> | null>(null)
const busy = ref(false)

const suggestedName = computed(() =>
  lv.value ? `lv_${lv.value.vgName}_${lv.value.name}`.replace(/[^A-Za-z0-9_-]/g, '_') : '',
)

onMounted(() => {
  lvm.setSanId(props.sanId)
  if (suggestedName.value) deviceName.value = suggestedName.value
})

watch([deviceName, lv], async () => {
  if (!lv.value || !deviceName.value) { preflight.value = null; return }
  try {
    preflight.value = await lvm.preflight({
      action: 'bind_scst',
      payload: {
        vgName: lv.value.vgName,
        lvName: lv.value.name,
        deviceName: deviceName.value,
        confirmation: '',
      },
    })
  } catch {
    preflight.value = null
  }
})

async function execute() {
  if (!preflight.value?.ok || !lv.value) return
  busy.value = true
  try {
    await lvm.bindScst({
      vgName: lv.value.vgName,
      lvName: lv.value.name,
      deviceName: deviceName.value.trim(),
      confirmation: confirmation.value.trim(),
    })
    toast.success(t('lvm.wizard.scst_device.success'))
    emit('close')
  } catch (e: any) {
    toast.error(t('lvm.wizard.execute_failed'), e?.statusMessage ?? 'Erreur')
  } finally {
    busy.value = false
  }
}
</script>
