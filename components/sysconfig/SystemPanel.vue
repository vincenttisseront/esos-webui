<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-computer-desktop" class="text-gray-500 size-5" />
        <span class="font-semibold text-gray-800">Système</span>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Hostname summary (passed from parent) -->
      <div v-if="fqdn" class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
        FQDN actuel : <span class="font-mono font-semibold text-gray-800">{{ fqdn }}</span>
      </div>

      <!-- Power actions -->
      <div class="border border-gray-200 rounded-lg p-4 space-y-4">
        <p class="text-sm font-semibold text-gray-700">Actions système</p>

        <div class="flex flex-col sm:flex-row gap-3">
          <!-- Reboot -->
          <UButton
            label="Redémarrer"
            icon="i-heroicons-arrow-path"
            color="amber"
            variant="outline"
            :loading="rebooting"
            :disabled="props.disabled || rebooting || poweringOff"
            class="flex-1"
            @click="onReboot"
          />

          <!-- Power off -->
          <UButton
            label="Éteindre"
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
          Ces actions sont immédiatement transmises au SAN sélectionné. La connexion SSH sera interrompue.
        </p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { modalPasswordConfirm } from '~/composables/useModal'
import { useAppToast }          from '~/composables/useAppToast'

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
    title:        'Redémarrer le SAN ?',
    message:      'Le SAN va redémarrer. La connexion SSH sera temporairement perdue.',
    confirmLabel: 'Redémarrer',
    intent:       'danger',
  })
  if (!password) return

  rebooting.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/power`, {
      method: 'POST',
      body:   { action: 'reboot', password },
    })
    toast.success('Redémarrage initié', 'La reconnexion peut prendre quelques minutes.')
  } catch (err: any) {
    toast.error('Échec', err?.data?.message ?? String(err))
  } finally {
    rebooting.value = false
  }
}

async function onPowerOff() {
  const password = await modalPasswordConfirm({
    title:        'Éteindre le SAN ?',
    message:      'Cette action va éteindre le SAN. Il ne redémarrera pas automatiquement.',
    confirmLabel: 'Éteindre',
    intent:       'danger',
  })
  if (!password) return

  poweringOff.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/power`, {
      method: 'POST',
      body:   { action: 'poweroff', password },
    })
    toast.success('Extinction initiée')
  } catch (err: any) {
    toast.error('Échec', err?.data?.message ?? String(err))
  } finally {
    poweringOff.value = false
  }
}
</script>
