<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-globe-alt" class="text-gray-500 dark:text-gray-400 size-5" />
        <span class="font-semibold text-gray-800 dark:text-gray-200">{{ t('admin.sysconfig.network.title') }}</span>
      </div>
    </template>

    <div class="space-y-6">
      <UAlert
        color="amber"
        variant="subtle"
        icon="i-heroicons-exclamation-triangle"
        :title="t('admin.sysconfig.network.warn_title') as string"
        :description="t('admin.sysconfig.network.warn_desc') as string"
      />

      <UAlert
        v-if="pendingSave"
        color="orange"
        variant="solid"
        icon="i-heroicons-arrow-path"
        :title="t('admin.sysconfig.network.pending_title') as string"
        :description="t('admin.sysconfig.network.pending_desc') as string"
      />

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UFormField :label="t('admin.sysconfig.network.gateway') as string">
          <UInput v-model="form.gateway" placeholder="192.168.1.1" :disabled="isDisabled" />
        </UFormField>

        <UFormField :label="t('admin.sysconfig.network.dns') as string">
          <UInput v-model="nameserversStr" placeholder="8.8.8.8, 1.1.1.1" :disabled="isDisabled" />
        </UFormField>

        <UFormField :label="t('admin.sysconfig.network.search_domain') as string">
          <UInput v-model="form.searchDomain" placeholder="example.com" :disabled="isDisabled" />
        </UFormField>
      </div>

      <div
        v-for="iface in form.interfaces"
        :key="iface.index"
        class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="size-2 rounded-full"
              :class="iface.state === 'up' ? 'bg-green-500' : 'bg-gray-300'"
            />
            <span class="font-mono font-semibold text-gray-800 dark:text-gray-200">{{ iface.ifname }}</span>
            <span v-if="iface.currentIp" class="text-xs text-gray-500 dark:text-gray-400 font-mono">({{ iface.currentIp }})</span>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              :name="`dhcp-${iface.index}`"
              :value="true"
              v-model="iface.useDHCP"
              :disabled="isDisabled"
            />
            {{ t('admin.sysconfig.network.dhcp') }}
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              :name="`dhcp-${iface.index}`"
              :value="false"
              v-model="iface.useDHCP"
              :disabled="isDisabled"
            />
            {{ t('admin.sysconfig.network.static') }}
          </label>
        </div>

        <div v-if="!iface.useDHCP" class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <UFormField :label="t('admin.sysconfig.network.ip') as string">
            <UInput v-model="iface.ipAddress" placeholder="192.168.1.10" :disabled="isDisabled" />
          </UFormField>
          <UFormField :label="t('admin.sysconfig.network.netmask') as string">
            <UInput v-model="iface.netmask" placeholder="255.255.255.0" :disabled="isDisabled" />
          </UFormField>
          <UFormField :label="t('admin.sysconfig.network.broadcast') as string">
            <UInput v-model="iface.broadcast" placeholder="192.168.1.255" :disabled="isDisabled" />
          </UFormField>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UFormField :label="t('admin.sysconfig.network.mtu') as string">
            <UInput
              v-model.number="iface.mtu"
              type="number"
              placeholder="1500"
              :disabled="isDisabled"
            />
          </UFormField>
          <UFormField v-if="iface.useDHCP" :label="t('admin.sysconfig.network.dhcp_timeout') as string">
            <UInput
              v-model.number="iface.dhcpTimeout"
              type="number"
              placeholder="15"
              :disabled="isDisabled"
            />
          </UFormField>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between">
        <UButton
          :label="t('admin.sysconfig.network.restart') as string"
          icon="i-heroicons-arrow-path"
          color="amber"
          variant="outline"
          :loading="restarting"
          :disabled="props.disabled || saving || restarting"
          @click="restartNetwork"
        />
        <UButton
          :label="t('admin.sysconfig.network.save') as string"
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="props.disabled"
          @click="save"
        />
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { NetworkGeneralConfig } from '~/server/utils/types'
import { useAppToast } from '~/composables/useAppToast'
import { useNetworkPendingRestart } from '~/composables/useNetworkPendingRestart'

const { t, tError } = useEsosI18n()

const props = defineProps<{
  sanId:     string
  sanLabel?: string
  config:    NetworkGeneralConfig
  disabled?: boolean
}>()

const emit = defineEmits<{
  saved: []
  restarted: []
}>()

const toast = useAppToast()
const { markPending, clearPending, isPending } = useNetworkPendingRestart()
const pendingSave = isPending(props.sanId)

const form = reactive<NetworkGeneralConfig>(JSON.parse(JSON.stringify(props.config)))

const nameserversStr = computed({
  get: () => form.nameservers.join(', '),
  set: (v: string) => {
    form.nameservers = v.split(',').map(s => s.trim()).filter(Boolean)
  },
})

const saving      = ref(false)
const restarting  = ref(false)

const isDisabled = computed(() => props.disabled || saving.value)

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/network`, {
      method: 'PATCH',
      body: { ...form },
    })
    markPending(props.sanId, props.sanLabel ?? props.sanId)
    toast.success(
      t('admin.sysconfig.network.toast_saved_title') as string,
      t('admin.sysconfig.network.toast_saved_desc') as string,
    )
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    saving.value = false
  }
}

async function restartNetwork() {
  restarting.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/network/restart`, { method: 'POST' })
    clearPending(props.sanId)
    toast.success(
      t('admin.sysconfig.network.toast_restart_title') as string,
      t('admin.sysconfig.network.toast_restart_desc') as string,
    )
    emit('restarted')
  } catch (err: unknown) {
    toast.error(t('admin.sysconfig.network.toast_restart_fail') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    restarting.value = false
  }
}
</script>
