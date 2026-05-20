<template>
  <LvmWizardModalShell
    :title="t('lvm.wizard.scst_device.title')"
    :step="1"
    :total-steps="1"
    icon="i-heroicons-circle-stack"
  >
    <div v-if="lv" class="space-y-4">
      <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        {{ t('lvm.wizard.scst_device.explanation', { lvPath: lv.path }) }}
      </p>

      <dl class="text-sm space-y-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 px-3 py-2.5">
        <div class="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt class="text-gray-500 dark:text-gray-400 shrink-0 font-medium">
            {{ t('lvm.wizard.scst_device.backing_label') }}
          </dt>
          <dd class="font-mono text-gray-900 dark:text-gray-100 break-all">{{ lv.path }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400 font-medium mb-1">
            {{ t('lvm.wizard.scst_device.name') }}
          </dt>
          <dd>
            <UInput
              v-model="deviceName"
              :placeholder="suggestedName"
              :error="nameFieldError ?? undefined"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ t('lvm.wizard.scst_device.name_help') }}
            </p>
          </dd>
        </div>
      </dl>

      <div
        v-if="isClustered && clusterCommandRows.length"
        class="rounded-md border border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-950/30 px-3 py-2.5 space-y-2"
      >
        <p class="text-xs text-primary-800 dark:text-primary-200">
          {{ t('lvm.wizard.scst_device.cluster_note') }}
        </p>
        <ul class="space-y-1.5 text-xs font-mono text-primary-900 dark:text-primary-100">
          <li v-for="row in clusterCommandRows" :key="row.label" class="break-all">
            <span class="font-sans font-medium text-primary-700 dark:text-primary-300">{{ row.label }}:</span>
            {{ row.command }}
          </li>
        </ul>
      </div>

      <UAlert
        color="blue"
        variant="soft"
        :title="t('lvm.wizard.scst_device.next_steps_title')"
        :description="t('lvm.wizard.scst_device.next_steps_body')"
      />

      <UAlert
        v-if="preflightBlockerText"
        color="red"
        variant="soft"
        :title="preflightBlockerText"
      />

      <div
        v-if="canShowConfirmation"
        class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2"
      >
        <p class="text-xs text-gray-600 dark:text-gray-400">
          {{ t('lvm.wizard.scst_device.phrase_help', { phrase: confirmationPhrase }) }}
        </p>
        <p class="font-mono text-sm font-semibold text-primary-700 dark:text-primary-300 select-all">
          {{ confirmationPhrase }}
        </p>
        <UFormGroup :label="t('lvm.confirm.label')">
          <UInput
            v-model="confirmation"
            :placeholder="confirmationPhrase"
            class="font-mono"
          />
        </UFormGroup>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="emit('cancel')">
          {{ t('lvm.wizard.cancel') }}
        </UButton>
        <UButton
          color="primary"
          :loading="busy"
          :disabled="!canExecute"
          @click="execute"
        >
          {{ t('lvm.wizard.scst_device.execute') }}
        </UButton>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import type { LogicalVolume } from '~/types/lvm'
import {
  buildScstRegisterPreview,
  suggestedScstDeviceName,
  validateScstDeviceName,
} from '~/utils/lvm-scst-device-ui'

const props = defineProps<{
  sanId: string
  lv: LogicalVolume
  isClustered?: boolean
  clusterId?: string
}>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const lv = computed(() => props.lv)
const deviceName = ref('')
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof lvm.preflight>> | null>(null)
const busy = ref(false)

const isClustered = computed(() => !!props.isClustered && !!props.clusterId)

const suggestedName = computed(() =>
  lv.value ? suggestedScstDeviceName(lv.value.vgName, lv.value.name) : '',
)

const nameValidationKey = computed(() => validateScstDeviceName(deviceName.value))

const nameFieldError = computed(() => {
  switch (nameValidationKey.value) {
    case 'empty':
      return t('lvm.wizard.scst_device.error_name_empty')
    case 'invalid':
      return t('lvm.wizard.scst_device.error_name_invalid')
    case 'too_long':
      return t('lvm.wizard.scst_device.error_name_too_long')
    default:
      return null
  }
})

const preflightBlockerText = computed(() => {
  if (nameFieldError.value) return null
  const blockers = preflight.value?.blockers ?? []
  if (!blockers.length) return null
  const duplicate = blockers.find(b => /existe déjà|already exists/i.test(b))
  if (duplicate) return t('lvm.wizard.scst_device.error_name_exists', { name: deviceName.value.trim() })
  return blockers.join(' · ')
})

const clusterCommandRows = computed(() => {
  if (!isClustered.value || !lv.value || nameValidationKey.value) return []
  const dev = deviceName.value.trim()
  if (!dev) return []
  const cmd = buildScstRegisterPreview(dev, lv.value.path)
  const inv = lvm.clusterInventory ?? []
  if (inv.length) {
    return inv.filter(n => n.sshReady).map(n => ({ label: n.label, command: cmd }))
  }
  const peers = lvm.clusterPeers ?? []
  const selfLabel = peers.find(p => p.nodeSanId === props.sanId)?.nodeLabel ?? props.sanId
  const rows = [{ label: selfLabel, command: cmd }]
  for (const p of peers) {
    if (p.nodeSanId !== props.sanId) rows.push({ label: p.nodeLabel, command: cmd })
  }
  return rows
})

const confirmationPhrase = computed(() => preflight.value?.requiredConfirmation ?? '')

const canShowConfirmation = computed(() =>
  !nameValidationKey.value && !!preflight.value?.ok && !!confirmationPhrase.value,
)

const canExecute = computed(() =>
  canShowConfirmation.value
  && confirmation.value.trim() === confirmationPhrase.value,
)

onMounted(async () => {
  lvm.setSanId(props.sanId)
  if (isClustered.value && props.clusterId) {
    lvm.setClusterContext(props.clusterId, props.sanId)
    await lvm.fetchClusterInventory(props.clusterId)
  }
  if (suggestedName.value) deviceName.value = suggestedName.value
})

watch([deviceName, lv], async () => {
  preflight.value = null
  if (!lv.value || nameValidationKey.value) return
  try {
    preflight.value = await lvm.preflight({
      action: 'bind_scst',
      payload: {
        vgName: lv.value.vgName,
        lvName: lv.value.name,
        deviceName: deviceName.value.trim(),
        confirmation: '',
      },
    })
  } catch {
    preflight.value = null
  }
}, { immediate: true })

async function execute() {
  if (!canExecute.value || !lv.value) return
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
