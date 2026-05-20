<template>
  <LvmWizardModalShell
    :title="t('lvm.wizard.lv_create.title')"
    :step="1"
    :total-steps="1"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-3">
      <UFormGroup
        :label="t('lvm.wizard.lv_create.vg_label')"
        :hint="t('lvm.wizard.lv_create.vg_help')"
      >
        <LvmNativeSelect v-model="vgName" :options="vgOptions" />
      </UFormGroup>
      <p v-if="selectedVgSummary" class="text-sm text-gray-700 dark:text-gray-300 -mt-2">
        {{ selectedVgSummary }}
      </p>

      <UFormGroup :label="t('lvm.wizard.lv_create.lv_name_label')">
        <UInput v-model="lvName" placeholder="lv0" />
      </UFormGroup>

      <UFormGroup
        :label="t('lvm.wizard.lv_create.lv_size_label')"
        :hint="t('lvm.wizard.lv_create.unit_hint')"
        :error="sizeValidationError ?? undefined"
      >
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model.number="sizeGib"
            type="number"
            min="0"
            step="0.1"
            class="flex-1 min-w-[8rem]"
          />
          <span class="text-sm font-medium text-gray-600 dark:text-gray-400 shrink-0">
            {{ t('lvm.wizard.lv_create.unit_gib') }}
          </span>
        </div>
      </UFormGroup>
      <p v-if="sizePreview" class="text-xs text-gray-500 -mt-2">
        {{ sizePreview }}
      </p>

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
import { formatLvSizeGibLabel, validateLvCreateSizeGib } from '~/utils/lvm-lv-wizard-ui'

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
    .map(v => ({
      label: t('lvm.wizard.lv_create.vg_option', { name: v.name, size: formatBytes(v.freeBytes) }),
      value: v.name,
    })),
)

const selectedVg = computed(() => lvm.vgs.find(v => v.name === vgName.value))

const maxFreeBytes = computed(() => selectedVg.value?.freeBytes ?? 0)

const selectedVgSummary = computed(() => {
  if (!vgName.value || !selectedVg.value) return ''
  return t('lvm.wizard.lv_create.vg_free_summary', {
    name: vgName.value,
    size: formatBytes(maxFreeBytes.value),
  })
})

const sizeValidationKey = computed(() =>
  validateLvCreateSizeGib(Number(sizeGib.value), maxFreeBytes.value),
)

const sizeValidationError = computed(() => {
  switch (sizeValidationKey.value) {
    case 'zero':
      return t('lvm.wizard.lv_create.error_size_zero')
    case 'exceeds':
      return t('lvm.wizard.lv_create.error_size_exceeds', { max: formatBytes(maxFreeBytes.value) })
    default:
      return null
  }
})

const sizePreview = computed(() => {
  const label = formatLvSizeGibLabel(Number(sizeGib.value))
  if (!label || sizeValidationKey.value) return ''
  return label
})

const formValid = computed(() =>
  !!vgName.value
  && !!lvName.value.trim()
  && !sizeValidationKey.value
  && maxFreeBytes.value > 0,
)

const canExecute = computed(() => formValid.value && preflight.value?.ok)

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
  try {
    await lvm.createLv({
      vgName: vgName.value,
      name: lvName.value,
      sizeBytes: Math.floor(Number(sizeGib.value) * 1024 ** 3),
      confirmation: confirmation.value.trim(),
    })
    toast.success(t('lvm.wizard.lv_create.success'))
    emit('close')
  } catch (e: any) {
    toast.error(t('lvm.wizard.execute_failed'), e?.statusMessage ?? 'Erreur')
  } finally {
    busy.value = false
  }
}
</script>
