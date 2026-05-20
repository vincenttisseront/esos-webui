<template>
  <LvmWizardModalShell
    :title="t('lvm.wizard.lv_create.title')"
    :step="1"
    :total-steps="1"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-4">
      <LvmCreateLvFormStep
        v-model:vg-name="vgName"
        v-model:lv-name="lvName"
        v-model:size-gib="sizeGib"
        :vg-options="vgOptions"
        :max-free-bytes="maxFreeBytes"
        :size-error="sizeValidationError"
      />

      <UAlert v-if="preflight?.blockers.length" color="red" variant="soft" :title="preflight.blockers.join(' · ')" />
      <UFormGroup v-if="preflight?.ok" :label="t('lvm.confirm.label')">
        <UInput v-model="confirmation" :placeholder="preflight.requiredConfirmation" />
      </UFormGroup>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="emit('cancel')">{{ t('lvm.wizard.cancel') }}</UButton>
        <UButton color="primary" :loading="busy" :disabled="!canExecute" @click="execute">{{ t('lvm.wizard.execute') }}</UButton>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import { formatLvmBytes, validateLvCreateSizeGib } from '~/utils/lvm-lv-wizard-ui'

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
  lvm.vgs
    .filter(v => !v.clustered)
    .map(v => ({ label: v.name, value: v.name })),
)

const selectedVg = computed(() => lvm.vgs.find(v => v.name === vgName.value))

const maxFreeBytes = computed(() => selectedVg.value?.freeBytes ?? 0)

const sizeValidationKey = computed(() =>
  validateLvCreateSizeGib(Number(sizeGib.value), maxFreeBytes.value),
)

const sizeValidationError = computed(() => {
  switch (sizeValidationKey.value) {
    case 'zero':
      return t('lvm.wizard.lv_create.error_size_zero')
    case 'exceeds':
      return t('lvm.wizard.lv_create.error_size_exceeds', { max: formatLvmBytes(maxFreeBytes.value) })
    default:
      return null
  }
})

const formValid = computed(() =>
  !!vgName.value
  && !!lvName.value.trim()
  && !sizeValidationKey.value
  && maxFreeBytes.value > 0,
)

const canExecute = computed(() => formValid.value && preflight.value?.ok)

onMounted(() => {
  lvm.setSanId(props.sanId)
  if (vgOptions.value.length) vgName.value = vgOptions.value[0].value
})

watch([vgName, lvName, sizeGib], async () => {
  if (!formValid.value) {
    preflight.value = null
    return
  }
  const sizeBytes = Math.floor(Number(sizeGib.value) * 1024 ** 3)
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
  if (!canExecute.value) return
  busy.value = true
  const name = lvName.value.trim()
  try {
    await lvm.createLv({
      vgName: vgName.value,
      name,
      sizeBytes: Math.floor(Number(sizeGib.value) * 1024 ** 3),
      confirmation: confirmation.value.trim(),
    })
    if (!lvm.lvExistsAfterRefresh(vgName.value, name)) {
      toast.warning(t('lvm.wizard.lv_create.not_detected_after_refresh'))
      return
    }
    toast.success(t('lvm.wizard.lv_create.success'))
    emit('close')
  } catch (e: any) {
    toast.error(t('lvm.wizard.execute_failed'), e?.statusMessage ?? 'Erreur')
  } finally {
    busy.value = false
  }
}
</script>
