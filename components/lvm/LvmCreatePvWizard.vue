<template>
  <LvmWizardModalShell
    :title="t('lvm.wizard.pv_create.title')"
    :step="1"
    :total-steps="1"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-3">
      <UFormGroup
        :label="t('lvm.wizard.pv_create.device')"
        :hint="t('lvm.wizard.pv_create.device_help')"
      >
        <LvmNativeSelect v-model="selectedPath" :options="deviceOptions" />
      </UFormGroup>
      <UCheckbox v-model="force" :label="t('lvm.wizard.pv_create.force')" />
      <UAlert v-if="preflight?.blockers.length" color="red" variant="soft" :title="preflight.blockers.join(' · ')" />
      <p v-if="preflight?.commandPreview" class="text-xs font-mono text-gray-500">{{ preflight.commandPreview }}</p>
      <UFormGroup v-if="preflight?.ok" :label="t('lvm.confirm.label')">
        <UInput v-model="confirmation" :placeholder="preflight.requiredConfirmation" />
      </UFormGroup>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="emit('cancel')">{{ t('lvm.wizard.cancel') }}</UButton>
        <UButton color="primary" :loading="busy" :disabled="!preflight?.ok" @click="execute">
          {{ t('lvm.wizard.execute') }}
        </UButton>
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

const selectedPath = ref('')
const force = ref(false)
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof lvm.preflight>> | null>(null)
const busy = ref(false)

const deviceOptions = computed(() =>
  lvm.candidates.map(c => ({
    value: c.path,
    label: c.eligible ? c.path : `${c.path} (${c.reasons[0] ?? 'ineligible'})`,
    disabled: !c.eligible && !force.value,
  })),
)

onMounted(() => {
  lvm.setSanId(props.sanId)
  if (lvm.candidates.length) {
    selectedPath.value = lvm.candidates.find(c => c.eligible)?.path ?? ''
  }
})

watch([selectedPath, force], async () => {
  if (!selectedPath.value) { preflight.value = null; return }
  try {
    preflight.value = await lvm.preflight({
      action: 'pvcreate',
      payload: { path: selectedPath.value, force: force.value, confirmation: '' },
    })
  } catch {
    preflight.value = null
  }
})

async function execute() {
  if (!preflight.value?.ok || !selectedPath.value) return
  busy.value = true
  try {
    await lvm.createPv({
      path: selectedPath.value,
      force: force.value,
      confirmation: confirmation.value.trim(),
    })
    toast.add({ title: t('lvm.wizard.pv_create.success'), color: 'green' })
    emit('close')
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  } finally {
    busy.value = false
  }
}
</script>
