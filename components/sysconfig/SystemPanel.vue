<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-computer-desktop" class="text-gray-500 size-5" />
        <span class="font-semibold text-gray-800">{{ t('admin.sysconfig.system.title') }}</span>
      </div>
    </template>

    <div class="space-y-6">
      <div v-if="fqdn" class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
        {{ t('admin.sysconfig.system.fqdn_current') }} :
        <span class="font-mono font-semibold text-gray-800">{{ fqdn }}</span>
      </div>

      <div class="border border-gray-200 rounded-lg p-4 space-y-4">
        <p class="text-sm font-semibold text-gray-700">{{ t('admin.sysconfig.system.actions_title') }}</p>

        <div class="flex flex-col sm:flex-row gap-3">
          <UButton
            :label="t('admin.sysconfig.system.reboot') as string"
            icon="i-heroicons-arrow-path"
            color="amber"
            variant="outline"
            :loading="rebooting"
            :disabled="props.disabled || rebooting || poweringOff"
            class="flex-1"
            @click="onReboot"
          />

          <UButton
            :label="t('admin.sysconfig.system.poweroff') as string"
            icon="i-heroicons-power"
            color="red"
            variant="outline"
            :loading="poweringOff"
            :disabled="props.disabled || rebooting || poweringOff"
            class="flex-1"
            @click="onPowerOff"
          />
        </div>

        <p class="text-xs text-gray-400">
          {{ t('admin.sysconfig.system.actions_hint') }}
        </p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { modalPasswordConfirm } from '~/composables/useModal'
import { useAppToast } from '~/composables/useAppToast'

const { t, tError } = useEsosI18n()

const props = defineProps<{
  sanId:    string
  fqdn?:    string
  disabled?: boolean
}>()

const toast       = useAppToast()
const rebooting   = ref(false)
const poweringOff = ref(false)

async function onReboot() {
  const password = await modalPasswordConfirm({
    title:        t('admin.sysconfig.system.confirm_reboot_title') as string,
    message:      t('admin.sysconfig.system.confirm_reboot_msg') as string,
    confirmLabel: t('admin.sysconfig.system.reboot') as string,
    intent:       'danger',
  })
  if (!password) return

  rebooting.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/power`, {
      method: 'POST',
      body:   { action: 'reboot', password },
    })
    toast.success(
      t('admin.sysconfig.system.toast_reboot') as string,
      t('admin.sysconfig.system.toast_reboot_desc') as string,
    )
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    rebooting.value = false
  }
}

async function onPowerOff() {
  const password = await modalPasswordConfirm({
    title:        t('admin.sysconfig.system.confirm_poweroff_title') as string,
    message:      t('admin.sysconfig.system.confirm_poweroff_msg') as string,
    confirmLabel: t('admin.sysconfig.system.poweroff') as string,
    intent:       'danger',
  })
  if (!password) return

  poweringOff.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/power`, {
      method: 'POST',
      body:   { action: 'poweroff', password },
    })
    toast.success(t('admin.sysconfig.system.toast_poweroff') as string)
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    poweringOff.value = false
  }
}
</script>
