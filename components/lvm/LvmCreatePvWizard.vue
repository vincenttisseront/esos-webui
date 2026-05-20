<template>
  <UModal v-model="open">
    <UCard class="max-w-lg">
      <template #header>{{ t('lvm.wizard.pv_create.title') }}</template>
      <div class="space-y-3">
        <UFormGroup :label="t('lvm.wizard.pv_create.device')">
          <USelect
            v-model="selectedPath"
            :items="deviceOptions"
            value-attribute="value"
            option-attribute="label"
          />
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
          <UButton color="gray" variant="ghost" @click="open = false">{{ t('lvm.wizard.cancel') }}</UButton>
          <UButton color="primary" :loading="busy" :disabled="!preflight?.ok" @click="execute">
            {{ t('lvm.wizard.execute') }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; sanId: string; isClustered?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; done: [] }>()
const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const open = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})
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

watch(open, (v) => {
  if (v && lvm.candidates.length) selectedPath.value = lvm.candidates.find(c => c.eligible)?.path ?? ''
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
    open.value = false
    emit('done')
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  } finally {
    busy.value = false
  }
}
</script>
